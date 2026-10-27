import { ApplicationSchema, type ApplicationRecord, type CollectionResult, type JobPosting, type Platform } from "../core/model"
import { normalizeCompanyName } from "../core/company"
import { parseApplicationDate } from "../core/dates"
import { applicationIdentity } from "../core/identity"
import { jobIdFromUrl, safeJobUrl } from "../core/urls"
import type { FieldConfig, FieldsConfig, SelectorProfile } from "./profile"
import { collectionPolicy } from "../collection/policy"

export function readField(element: Element | Document, field?: FieldConfig): string | undefined {
  if (!field) return undefined
  const target = field.selector === ":scope" && element instanceof Element ? element : element.querySelector(field.selector)
  const value = field.attribute ? target?.getAttribute(field.attribute) : target?.textContent
  return value?.trim() || undefined
}

export function parsePosting(element: Element, fields: FieldsConfig, platform: Platform, base: string): JobPosting | undefined {
  const companyName = readField(element, fields.company)
  const jobTitle = readField(element, fields.title)
  if (!companyName || !jobTitle || !normalizeCompanyName(companyName)) return undefined
  const jobUrl = safeJobUrl(readField(element, fields.url), platform, base)
  return {
    platform, companyName, jobTitle, jobUrl, element,
    sourceJobId: readField(element, fields.jobId) || jobIdFromUrl(jobUrl),
    // The profile must namespace identifiers (e.g. biz:123...), never compare site-local IDs across sites.
    companyIdentifier: readField(element, fields.companyIdentifier)
  }
}

export function parseRecord(element: Element, profile: SelectorProfile, base: string, evidence: ApplicationRecord["evidence"] = "history_page", statusOverride?: ApplicationRecord["status"]): ApplicationRecord | undefined {
  const fields = evidence === "history_page" ? profile.historyFields : profile.postingFields
  const posting = parsePosting(element, fields, profile.platform, base)
  if (!posting) return undefined
  const { element: _, ...data } = posting
  const appliedAt = parseApplicationDate(readField(element, fields.date))
  const sourceApplicationId = readField(element, fields.applicationId)
  // Do not collapse indistinguishable applications or create a fresh duplicate every sync.
  if (statusOverride !== "pending_confirmation" && !sourceApplicationId && !appliedAt) return undefined
  const now = new Date().toISOString()
  const record = {
    ...data, sourceApplicationId, appliedAt,
    normalizedCompanyName: normalizeCompanyName(posting.companyName),
    status: statusOverride || profile.statusMap[readField(element, fields.status) || ""] || "unknown",
    evidence, collectedAt: now, lastSeenAt: now, lastSyncedAt: now
  }
  const result = ApplicationSchema.safeParse({ ...record, id: applicationIdentity(record) })
  return result.success ? result.data : undefined
}

export function parseHistory(doc: Document, profile: SelectorProfile, base: string): CollectionResult {
  const result: CollectionResult = { records: [], code: "ok", message: "현재 화면을 확인했습니다.", skipped: 0, hasNextPage: false, scope: "현재 화면 · 전체 기간 수집 여부 미확인" }
  const exists = (selector?: string) => !!selector && !!doc.querySelector(selector)
  if (exists(profile.loginRequired)) return { ...result, code: "login_required", message: "채용 사이트에 직접 로그인한 뒤 지원 현황을 열어 주세요." }
  if (exists(profile.loading)) return { ...result, code: "loading", message: "지원 내역이 로딩 중입니다. 화면이 표시된 뒤 다시 시도해 주세요." }
  const root = doc.querySelector(profile.historyRoot)
  if (!root) return { ...result, code: "dom_changed", message: "지원 내역 영역을 찾지 못했습니다. 기존 기록은 유지됩니다. 선택자와 페이지를 확인해 주세요." }
  result.scope = readField(doc, profile.scope) || result.scope
  const next = profile.nextPage ? doc.querySelector(profile.nextPage) : null
  result.hasNextPage = !!next && !next.matches(':disabled,[disabled],[aria-disabled="true"]')
  const rows = Array.from(root.querySelectorAll(profile.historyRow))
  for (const row of rows.slice(0, collectionPolicy.maxRecordsPerMessage)) {
    const record = parseRecord(row, profile, base)
    if (record) result.records.push(record)
    else result.skipped++
  }
  result.skipped += Math.max(0, rows.length - collectionPolicy.maxRecordsPerMessage)
  if (!rows.length) return { ...result, code: exists(profile.empty) ? "empty" : "dom_changed", message: exists(profile.empty) ? "현재 조회 조건에 지원 내역이 없습니다. 저장된 기록은 유지됩니다." : "목록을 인식하지 못했습니다. 로딩 또는 선택자 변경을 확인해 주세요." }
  result.code = result.skipped || result.hasNextPage ? "partial" : "ok"
  result.message = `${result.records.length}건 인식${result.skipped ? ` · 정보 부족·식별 불가 또는 처리 한도로 ${result.skipped}건 제외` : ""}. 현재 조회 조건과 페이지에 표시된 내역만 가져옵니다.${result.hasNextPage ? " 다음 페이지가 있습니다." : ""}`
  return result
}
