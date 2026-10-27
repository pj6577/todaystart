import type { ApplicationRecord, SyncReport, Platform, PageState } from "../core/model"
import type { Settings } from "../storage/settings"
import type { Envelope } from "../messaging/protocol"
import type { HistoryRun } from "../collection/history-run-model"
import { sourceLabel } from "../core/model"
import type { HistoryCompletions } from "../storage/history-completions"
import type { SubmissionAttempt } from "../submission/model"
import type { PlannerSnapshot } from "../core/planner"

export interface Snapshot { records: ApplicationRecord[]; settings: Settings; reports: Partial<Record<Platform, SyncReport>>; historyRun?: HistoryRun; historyCompletions?: HistoryCompletions; submissionAttempts?: SubmissionAttempt[]; dataGeneration?: string; planner?: PlannerSnapshot }
export async function pageCommand<T = PageState>(tabId: number, type: "GET_PAGE" | "SYNC_PAGE" | "NEXT_PAGE" | "HISTORY_DIAGNOSTICS"): Promise<T> {
  const result: Envelope<T> = await chrome.tabs.sendMessage(tabId, { type })
  if (!result?.ok) throw new Error(result && !result.ok ? result.error : "페이지를 새로고침한 뒤 다시 시도해 주세요.")
  return result.data
}
export function formatTime(value?: string) { return value ? new Date(value).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "수집 이력 없음" }
export function download(filename: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob(["\ufeff", data], { type }))
  const link = document.createElement("a")
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function toCsv(records: ApplicationRecord[]): string {
  const escape = (value?: string) => {
    const safe = value && /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value || ""
    return '"' + safe.replace(/"/g, '""') + '"'
  }
  return [["기업명", "직무", "지원 경로", "지원일", "상태", "공고 URL", "열람 여부", "작성시간 원문", "사이트 상태"], ...records.map(r => [r.companyName, r.jobTitle, sourceLabel(r), r.appliedAt, r.status, r.jobUrl, r.readStatus || "unknown", r.sourceCreatedAt, r.sourceStatus])].map(row => row.map(escape).join(",")).join("\r\n")
}
