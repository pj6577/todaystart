import { ApplicationSchema, type ApplicationRecord, type CollectionResult, type Platform } from "../core/model"
import { normalizeCompanyName } from "../core/company"
import { parseApplicationDate } from "../core/dates"
import { applicationIdentity } from "../core/identity"
import { jobIdFromUrl, platformForUrl, safeJobUrl } from "../core/urls"
import { collectionPolicy } from "../collection/policy"
import { historyPagination, isBuiltInHistoryUrl } from "./history-pagination"
import { platformDefinitions } from "../core/platforms"
import { historyText, visibleHistoryRow as visibleRow } from "./history-dom"
import { rememberHistoryRoot, rememberHistoryRows, rememberRecord } from "./remember-history"
export { isBuiltInHistoryUrl } from "./history-pagination"
export { historyText } from "./history-dom"

function linkKind(link: Element, platform: Platform, base: string): "job" | "company" | undefined {
  try {
    const u = new URL(link.getAttribute("href") || "", base)
    if (platformForUrl(u.href) !== platform) return undefined
    const definition = platformDefinitions[platform]
    if (definition.jobPath?.test(u.pathname) && (!definition.jobQueryId || /^\d+$/.test(u.searchParams.get(definition.jobQueryId) || ""))) return "job"
    if (definition.companyPath?.test(u.pathname)) return "company"
  } catch { /* Invalid links do not establish application evidence. */ }
}

const datesIn = (text: string) => [...text.matchAll(/(?<!\d)(\d{4}|\d{2})\s*(?:[./-]|년)\s*(\d{1,2})\s*(?:[./-]|월)\s*(\d{1,2})(?:일|\.)?(?!\d)/g)]
  .map(match => parseApplicationDate(`${match[1]!.length === 2 ? "20" : ""}${match[1]}-${match[2]}-${match[3]}`)).filter((date): date is string => !!date)
function applicationDate(text: string, labelled = false): string | undefined {
  const labelledText = text.match(/(?:지원일(?:자)?|지원\s*날짜|접수일(?:자)?)\s*[:：]?\s*((?:\d|[./\-년월일\s]){6,30})/)?.[1]
  const dates = [...new Set(datesIn(labelledText || text))]
  return (labelled || labelledText || dates.length === 1) && dates.length === 1 ? dates[0] : undefined
}
function statusFrom(text: string): ApplicationRecord["status"] {
  if (/지원\s*취소|접수\s*취소|취소\s*완료/.test(text)) return "cancelled"
  if (/지원\s*완료|접수\s*완료|미열람|열람|서류\s*(?:전형|검토|합격|불합격)|전형\s*(?:진행|종료)/.test(text)) return "applied"
  return "unknown"
}
const readStatusFrom = (text: string): ApplicationRecord["readStatus"] => /^미열람$/.test(text.trim()) ? "unread" : /^열람$/.test(text.trim()) ? "read" : "unknown"

function wantedRecord(row: Element, base: string): ApplicationRecord | undefined {
  if (!visibleRow(row)) return undefined
  const field = (name: string) => { const node = row.querySelector(`[class*="List_List_table_td_${name}__"]`); return node ? historyText(node) : "" }
  const companyName = field("company_name"), jobTitle = field("position")
  const sourceCreatedAt = applicationDate(field("create_time"), true), sourceStatus = field("status")
  if (!companyName || !normalizeCompanyName(companyName) || !jobTitle || !sourceCreatedAt || !sourceStatus) return undefined
  const now = new Date().toISOString()
  const record = {
    platform: "wanted" as const, companyName, normalizedCompanyName: normalizeCompanyName(companyName), jobTitle,
    sourceCreatedAt, sourceStatus, readStatus: "unknown" as const,
    status: /취소/.test(sourceStatus) ? "cancelled" as const : /지원\s*완료|서류\s*통과|최종\s*합격|불합격/.test(sourceStatus) ? "applied" as const : "unknown" as const,
    evidence: "history_page" as const, collectedAt: now, lastSeenAt: now, lastSyncedAt: now
  }
  const parsed = ApplicationSchema.safeParse({ ...record, id: applicationIdentity(record) })
  return parsed.success ? parsed.data : undefined
}

// DOM boundaries and attributes documented in the user's Aside inspection,
// 2026-10-19. Read status and dates only from their own application fields;
// recommendations, read dates, hidden tooltips and cancel buttons are separate.
function inspectedRecord(row: Element, platform: "jobkorea" | "saramin", base: string): ApplicationRecord | undefined {
  if (!visibleRow(row)) return undefined
  const jobkorea = platform === "jobkorea"
  const metadata = jobkorea ? row.querySelector("[data-idx]") : row
  const field = (selector: string) => { const node = row.querySelector(selector); return node ? historyText(node) : "" }
  const attribute = (name: string) => metadata?.getAttribute(name)?.trim() || undefined
  const identifier = (name: string) => { const value = attribute(name); return value && /^\d{1,50}$/.test(value) ? value : undefined }
  const companyName = jobkorea ? field(".apply-board .company a") || attribute("data-memname") : attribute("data-company_nm") || field(".corp a")
  const jobTitle = jobkorea ? attribute("data-gititle") || field(".apply-board .description a") : attribute("data-recruittitle") || field(".recruit > a")
  const appliedAt = applicationDate(field(jobkorea ? ".apply-status .date" : ".col_date"), true)
  if (!companyName || !jobTitle || !appliedAt || !normalizeCompanyName(companyName)) return undefined
  const link = row.querySelector(jobkorea ? ".apply-board .description a[href]" : ".recruit > a[href]")
  const jobUrl = link ? safeJobUrl(link.getAttribute("href"), platform, base) : undefined
  const now = new Date().toISOString()
  const record = {
    platform, companyName, jobTitle, appliedAt, jobUrl,
    sourceApplicationId: identifier(jobkorea ? "data-idx" : "data-recruitapply_idx"),
    sourceJobId: identifier(jobkorea ? "data-gno" : "data-rec_idx") || jobIdFromUrl(jobUrl),
    companyIdentifier: identifier(jobkorea ? "data-memsysno" : "data-csn"),
    normalizedCompanyName: normalizeCompanyName(companyName),
    status: statusFrom(field(jobkorea ? ".apply-status .status" : ".status .txt_status")),
    readStatus: readStatusFrom(field(jobkorea ? ".reading .read-not" : ".status .txt_sub")),
    evidence: "history_page" as const, collectedAt: now, lastSeenAt: now, lastSyncedAt: now
  }
  const parsed = ApplicationSchema.safeParse({ ...record, id: applicationIdentity(record) })
  return parsed.success ? parsed.data : undefined
}

function recordFrom(row: Element, platform: Platform, base: string, columns?: { company: number; title: number; date: number; status: number }): ApplicationRecord | undefined {
  if (!visibleRow(row)) return undefined
  const text = historyText(row)
  if (!text) return undefined
  const links = Array.from(row.querySelectorAll("a[href]")).filter(link => !!historyText(link))
  const jobs = links.filter(link => linkKind(link, platform, base) === "job")
  const jobIds = new Set(jobs.map(link => jobIdFromUrl(safeJobUrl(link.getAttribute("href"), platform, base))))
  if (jobIds.size > 1) return undefined // Never merge two application rows.
  const job = jobs[0]
  const company = links.find(link => linkKind(link, platform, base) === "company")
  const cells = Array.from(row.querySelectorAll(":scope > td,:scope > [role=cell]"))
  const cell = (index: number) => index >= 0 ? cells[index] : undefined
  const companyCell = columns && cell(columns.company)
  const titleCell = columns && cell(columns.title)
  const dateCell = columns && cell(columns.date)
  const statusCell = columns && cell(columns.status)
  const companyName = company ? historyText(company) : companyCell && historyText(companyCell)
  const jobTitle = job ? historyText(job) : titleCell && historyText(titleCell)
  // Cards require actual application evidence, not a recommendation or a deadline.
  if (!columns && !/(?:지원일(?:자)?|지원\s*날짜|접수일(?:자)?|지원\s*완료|접수\s*완료|미열람|열람|지원\s*취소)/.test(text)) return undefined
  const appliedAt = applicationDate(dateCell ? historyText(dateCell) : text, !!dateCell)
  if (!companyName || !jobTitle || !appliedAt || !normalizeCompanyName(companyName)) return undefined
  const jobUrl = job ? safeJobUrl(job.getAttribute("href"), platform, base) : undefined
  const now = new Date().toISOString()
  const record = {
    platform, companyName, jobTitle, appliedAt, jobUrl, sourceJobId: jobIdFromUrl(jobUrl),
    normalizedCompanyName: normalizeCompanyName(companyName),
    status: statusFrom(statusCell ? historyText(statusCell) : text), evidence: "history_page" as const,
    collectedAt: now, lastSeenAt: now, lastSyncedAt: now
  }
  const parsed = ApplicationSchema.safeParse({ ...record, id: applicationIdentity(record) })
  return parsed.success ? parsed.data : undefined
}

export function historyObservationRoot(doc: Document): Element | undefined {
  const platform = platformForUrl(doc.URL)
  if (platform && isBuiltInHistoryUrl(doc.URL, platform)) {
    if (platform === "remember") return rememberHistoryRoot(doc) || doc.querySelector("main,[role=main]") || undefined
    const inspected = doc.querySelector(platform === "jobkorea" ? ".applyCont" : platform === "saramin" ? "#apply_status_list_div" : 'section[class*="Body_Body__"],div[class*="List_List_table__"]')
    if (inspected) return inspected
  }
  return doc.querySelector("main,[role=main]") || Array.from(doc.querySelectorAll("table,[role=table]"))
    .find(table => Array.from(table.querySelectorAll("th,[role=columnheader]")).some(header => /^(?:지원일|지원일자|지원날짜|접수일|접수일자)$/.test(historyText(header).replace(/\s+/g, ""))))?.parentElement || undefined
}

export function parseBuiltInHistory(doc: Document, platform: Platform, base = doc.URL): CollectionResult {
  const result: CollectionResult = { records: [], code: "selectors_unverified", skipped: 0, hasNextPage: false, scope: "현재 화면 · 현재 조회 조건", message: "지원 목록을 인식하지 못했습니다. 화면 구조 진단 파일로 확인이 필요합니다." }
  if (!isBuiltInHistoryUrl(base, platform)) return result
  const pagination = historyPagination(doc, platform, base)
  result.scope = pagination.scope
  result.hasNextPage = pagination.hasNextPage
  const root = historyObservationRoot(doc) || doc.body
  if (!root) return result
  const candidates = new Set<Element>()
  const inspectedRows = platform === "remember" ? rememberHistoryRows(root) : platform === "jobkorea" ? [...new Set([...root.querySelectorAll(".applymng-list .apply-board")].map(board => board.closest("tr")).filter((row): row is HTMLTableRowElement => !!row))] : platform === "saramin" ? [...root.querySelectorAll(".list_status ._apply_list")] : [...root.querySelectorAll('li[class*="List_List_table_tr__"]')]
  for (const row of inspectedRows) {
    candidates.add(row)
    if (!visibleRow(row)) continue
    const record = platform === "remember" ? rememberRecord(row) : platform === "wanted" ? wantedRecord(row, base) : inspectedRecord(row, platform, base)
    if (record) result.records.push(record)
    else result.skipped++
  }
  for (const table of inspectedRows.length || platform === "remember" ? [] : root.querySelectorAll("table,[role=table]")) {
    const headers = Array.from(table.querySelectorAll("thead th,tr:first-child > th,[role=columnheader]")).map(header => historyText(header).replace(/\s+/g, ""))
    const columns = {
      company: headers.findIndex(text => /^(?:기업명|회사명|기업|지원기업)$/.test(text)),
      title: headers.findIndex(text => /^(?:공고명|공고제목|채용공고|지원공고|모집분야|지원직무)$/.test(text)),
      date: headers.findIndex(text => /^(?:지원일|지원일자|지원날짜|접수일|접수일자)$/.test(text)),
      status: headers.findIndex(text => /지원상태|진행상태|열람여부|지원결과|전형결과/.test(text))
    }
    if (columns.date < 0) continue
    for (const row of table.querySelectorAll("tbody > tr,[role=row]")) {
      if (!row.querySelector("td,[role=cell]")) continue
      candidates.add(row)
      const record = recordFrom(row, platform, base, columns)
      if (record) result.records.push(record)
      else result.skipped++
    }
  }
  for (const link of inspectedRows.length ? [] : root.querySelectorAll("a[href]")) {
    if (linkKind(link, platform, base) !== "job" || !historyText(link) || [...candidates].some(row => row.contains(link))) continue
    let row = link.parentElement
    for (let depth = 0; row && row !== root && depth < 7; depth++, row = row.parentElement) {
      if (row.matches("body,main,[role=main],nav,header,footer")) break
      const record = recordFrom(row, platform, base)
      if (record) { result.records.push(record); candidates.add(row); break }
    }
  }
  result.records = [...new Map(result.records.map(record => [record.id, record])).values()]
  if (result.records.length > collectionPolicy.maxRecordsPerMessage) {
    result.skipped += result.records.length - collectionPolicy.maxRecordsPerMessage
    result.records = result.records.slice(0, collectionPolicy.maxRecordsPerMessage)
  }
  const text = historyText(root)
  if (result.records.length) {
    result.code = "partial"
    result.message = `${result.records.length}건 인식${result.skipped ? ` · ${result.skipped}건 정보 확인 필요` : ""}. ${result.scope}.${result.hasNextPage ? " 다음 페이지가 있습니다." : " 현재 화면에서 확인된 기록만 가져왔습니다."}`
  } else if (/지원\s*(?:내역|현황|기록)(?:이|이\s*|은\s*)?\s*없|지원한\s*(?:기업|공고)(?:이|가)?\s*없/.test(text)) {
    result.code = "empty"; result.message = "현재 조회 조건에 지원 내역이 없습니다. 저장된 기록은 유지됩니다."
  } else if (/로그인(?:이|을|\s+후|\s*필요)|개인회원\s*로그인/.test(text) && !root.querySelector("table,[role=table]")) {
    result.code = "login_required"; result.message = "사이트에 직접 로그인한 뒤 지원 현황을 새로고침해 주세요."
  }
  return result
}
