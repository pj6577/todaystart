import type { ApplicationRecord } from "../core/model"
import { sendPageRequest, PageRequestError, type PageRequest, type PageResponseMap } from "../messaging/page-protocol"
import { sourceLabel } from "../core/model"

export type { Snapshot } from "../messaging/contracts"
export async function pageCommand<K extends PageRequest["type"]>(tabId: number, type: K): Promise<PageResponseMap[K]> {
  try { return await sendPageRequest(tabId, { type } as Extract<PageRequest, { type: K }>) }
  catch (error) {
    if (error instanceof PageRequestError && error.kind === "no_response") throw new Error("페이지를 새로고침한 뒤 다시 시도해 주세요.")
    throw error
  }
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
