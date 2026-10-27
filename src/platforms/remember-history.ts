import { ApplicationSchema, type ApplicationRecord } from "../core/model"
import { normalizeCompanyName } from "../core/company"
import { parseApplicationDate } from "../core/dates"
import { applicationIdentity } from "../core/identity"
import { historyText, visibleHistoryRow } from "./history-dom"

// User-supplied /applies DOM, 2026-10-21. Styled-component hashes are not
// selectors. A history article contains a title, company, dated receipt and
// its own details control. Summary counts and recommendations are not rows.
const detailsControl = (row: Element) => [...row.querySelectorAll("button")].some(button => button.textContent?.trim() === "자세히 보기")
export function rememberHistoryRoot(doc: Document): Element | undefined {
  const period = [...doc.querySelectorAll('[aria-haspopup="listbox"]')].find(element => visibleHistoryRow(element) && /^(?:전체\s*기간|최근\s*\d+\s*(?:년|개월|달|일))$/.test(element.textContent?.trim() || ""))
  if (period?.closest("section")) return period.closest("section")!
  const article = [...doc.querySelectorAll("article")].find(detailsControl)
  const list = article?.closest("section")
  return list?.parentElement?.matches("section") ? list.parentElement : list || undefined
}
export function rememberHistoryRows(root: Element): Element[] {
  return [...root.querySelectorAll("article")].filter(row => !row.closest("aside,nav,header,footer") && detailsControl(row))
}
export function rememberRecord(row: Element): ApplicationRecord | undefined {
  if (!visibleHistoryRow(row)) return undefined
  const title = row.querySelector("h4"), metadata = title?.parentElement
  if (!title || !metadata || !detailsControl(row)) return undefined
  const fields = [...metadata.children].filter(element => element.matches("p") && visibleHistoryRow(element))
  const companyName = fields[0] && historyText(fields[0]), jobTitle = historyText(title)
  const receipt = fields[1] && historyText(fields[1]).match(/^(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})\s+접수$/)
  const appliedAt = receipt && parseApplicationDate(receipt[1]!)
  if (!companyName || !normalizeCompanyName(companyName) || !jobTitle || !appliedAt) return undefined
  const badges = [...row.querySelectorAll("div,span,p,strong")].filter(element => !metadata.contains(element) && !element.contains(metadata) && !element.closest("button") && visibleHistoryRow(element)).map(historyText)
  const has = (label: string) => badges.includes(label)
  const sourceStatus = ["지원 취소", "접수 취소", "불합격", "최종 합격", "서류 통과", "서류 합격"].find(has) || "지원 접수"
  const now = new Date().toISOString()
  const record = {
    platform: "remember" as const, companyName, normalizedCompanyName: normalizeCompanyName(companyName), jobTitle, appliedAt,
    status: /취소/.test(sourceStatus) ? "cancelled" as const : "applied" as const,
    sourceStatus, readStatus: has("미열람") ? "unread" as const : has("열람") ? "read" as const : "unknown" as const,
    evidence: "history_page" as const, collectedAt: now, lastSeenAt: now, lastSyncedAt: now
  }
  // No source IDs or posting links are exposed in the supplied HTML. Keep
  // composite identity stable across imports and status/read-status changes.
  const parsed = ApplicationSchema.safeParse({ ...record, id: applicationIdentity(record) })
  return parsed.success ? parsed.data : undefined
}

// Hash the visible history filter context in the runner, including controls
// whose state changes without changing the URL. Never copy profile fields.
export function rememberHistoryContext(doc: Document, base: string): { url: string; period?: string } {
  const root = rememberHistoryRoot(doc), url = new URL(base)
  const period = root && [...root.querySelectorAll('[aria-haspopup="listbox"]')].map(element => element.textContent?.trim()).find(text => !!text && text.length <= 80)
  if (period) url.searchParams.set("__todaystart_period", period)
  const cancel = root && [...root.querySelectorAll("label")].find(element => /지원\s*취소\s*공고\s*포함/.test(element.textContent || ""))?.querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (cancel) url.searchParams.set("__todaystart_cancelled", String(cancel.checked))
  return { url: url.href, period: period || undefined }
}
