import { ApplicationSchema, DateSchema, type ApplicationRecord, type CollectionResult } from "../core/model"
import { applicationIdentity } from "../core/identity"
import { normalizeCompanyName } from "../core/company"
import { isBuiltInHistoryUrl } from "./history-pagination"

const labels: Record<string, string> = { complete: "지원 완료", pass: "서류 통과", hire: "최종 합격", reject: "불합격" }
const key = (record: Pick<ApplicationRecord, "companyName" | "jobTitle" | "sourceCreatedAt">) => JSON.stringify([normalizeCompanyName(record.companyName), record.jobTitle.trim(), record.sourceCreatedAt?.slice(0, 10)])
const id = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : typeof value === "string" && /^\d{1,50}$/.test(value) ? value : undefined

// Project the response immediately, before caching. Profile/resume/user fields
// are never copied into this cache or into stored application records.
function wantedCandidates(payload: unknown) {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { applications?: unknown }).applications)) return []
  const applications = (payload as { applications: unknown[] }).applications.slice(0, 2000)
  return applications.flatMap(value => {
    if (!value || typeof value !== "object") return []
    const row = value as Record<string, unknown>, job = row.job as Record<string, unknown> | undefined
    const sourceApplicationId = id(row.id), sourceJobId = id(row.job_id), companyIdentifier = id(row.company_id)
    const companyName = typeof row.company_name === "string" && row.company_name.length <= 300 ? row.company_name.trim() : undefined
    const jobTitle = job && typeof job.position === "string" && job.position.length <= 1000 ? job.position.trim() : undefined
    const sourceCreatedAt = typeof row.create_time === "string" && row.create_time.length <= 64 && DateSchema.safeParse(row.create_time.slice(0, 10)).success ? row.create_time : undefined
    if (!sourceApplicationId || !companyName || !jobTitle || !sourceCreatedAt) return []
    const readStatus = row.open_time === null ? "unread" as const : typeof row.open_time === "string" && DateSchema.safeParse(row.open_time.slice(0, 10)).success ? "read" as const : "unknown" as const
    return [{ sourceApplicationId, sourceJobId, companyIdentifier, companyName, jobTitle, sourceCreatedAt, readStatus, sourceStatus: typeof row.status === "string" ? labels[row.status] : undefined }]
  })
}
function applyCandidates(records: ApplicationRecord[], candidates: ReturnType<typeof wantedCandidates>): ApplicationRecord[] {
  return records.map(record => {
    const matches = candidates.filter(candidate => key(candidate) === key(record))
    if (matches.length !== 1 || records.filter(other => key(other) === key(record)).length !== 1) return record
    const match = matches[0]!, candidate = { ...match, sourceStatus: match.sourceStatus || record.sourceStatus }
    const parsed = ApplicationSchema.safeParse({ ...record, ...candidate, id: applicationIdentity({ ...record, ...candidate }) })
    return parsed.success ? parsed.data : record
  })
}
export function enrichWantedRecords(records: ApplicationRecord[], payload: unknown): ApplicationRecord[] { return applyCandidates(records, wantedCandidates(payload)) }

export function wantedRequestUrl(resources: string[], pageUrl: string): string | undefined {
  if (!isBuiltInHistoryUrl(pageUrl, "wanted")) return undefined
  const page = new URL(pageUrl)
  const defaults: Record<string, string> = { page: "1", offset: "0", limit: "10" }
  for (const resource of [...resources].reverse()) {
    try {
      const request = new URL(resource)
      if (request.origin !== page.origin || request.pathname !== "/api/v1/applications" || request.username || request.password) continue
      if (["page", "offset", "limit"].some(name => (request.searchParams.get(name) || defaults[name]) !== (page.searchParams.get(name) || defaults[name]))) continue
      if (["q", "start_date", "end_date", "status"].some(name => (page.searchParams.get(name) || "") && request.searchParams.get(name) !== page.searchParams.get(name))) continue
      return request.href
    } catch { /* Ignore unrelated or invalid resource URLs. */ }
  }
}

export class WantedHistoryReader {
  private cache?: { url: string; at: number; pending: Promise<ReturnType<typeof wantedCandidates>> }
  constructor(private resources = () => performance.getEntriesByType("resource").map(entry => entry.name), private request: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  async read(doc: Document, result: CollectionResult): Promise<CollectionResult> {
    if (!result.records.length || !result.records.every(record => record.platform === "wanted")) return result
    const pageUrl = doc.URL, url = wantedRequestUrl(this.resources(), pageUrl)
    if (!url) return result
    if (!this.cache || this.cache.url !== url || Date.now() - this.cache.at > 15000) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000)
      const pending = Promise.resolve().then(() => this.request(url, { credentials: "include", signal: controller.signal, redirect: "error", headers: { Accept: "application/json" } }))
        .then(response => response.ok ? response.json() : undefined).then(wantedCandidates).catch(() => []).finally(() => clearTimeout(timeout))
      this.cache = { url, at: Date.now(), pending }
    }
    const candidates = await this.cache.pending
    if (doc.URL !== pageUrl) return result
    return { ...result, records: applyCandidates(result.records, candidates) }
  }
}
