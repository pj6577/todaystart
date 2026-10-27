import { describe, expect, it } from "vitest"
import type { HistoryRun, HistoryRunIssue } from "../../src/collection/history-run-model"
import { historyRunNotice } from "../../src/ui/history-run-notice"

const run: HistoryRun = { id: "test", platform: "saramin", tabId: 1, status: "error", pages: 2, processed: 20, inserted: 18, updated: 2, skipped: 0, scope: "현재 조건", message: "internal failure", startedAt: "", updatedAt: "" }
describe("수집 결과를 사용자에게 안내", () => {
  it("로그인 안내를 감지한 경우에만 로그인이 필요하다고 알린다", () => {
    expect(historyRunNotice({ ...run, issue: "login_required" })).toMatchObject({ title: "사람인 · 로그인이 필요해요", action: "site", detail: "2페이지까지 확인 · 18건 추가 · 2건 갱신" })
    for (const issue of ["list_unreadable", "unknown"] as const) {
      const notice = historyRunNotice({ ...run, issue, message: "로그인 문제일 수도 있습니다" })
      expect(notice.title).not.toContain("로그인")
      expect(notice.message).toContain("원인")
      expect(notice.message).not.toContain("internal")
    }
  })
  it.each<[HistoryRunIssue, string]>([
    ["navigation_failed", "페이지 이동"], ["pagination_unknown", "마지막 페이지"], ["tab_closed", "탭이 닫혔어요"],
    ["context_changed", "조회 화면"], ["connection_lost", "연결하지 못했어요"], ["first_page_unavailable", "첫 페이지"],
    ["consent_disabled", "설정이 꺼져"], ["partial", "일부 기록"], ["repeated_page", "같은 목록"], ["page_limit", "한도"]
  ])("%s를 별개의 이유로 보여 준다", (issue, title) => {
    expect(historyRunNotice({ ...run, issue, skipped: 3 }).title).toContain(title)
  })
  it("알 수 없는 과거 오류와 사용자의 중지를 실패와 구분한다", () => {
    expect(historyRunNotice(run)).toMatchObject({ tone: "warning", message: expect.stringContaining("원인을 확인하지 못했어요") })
    expect(historyRunNotice({ ...run, status: "stopped", issue: "user_stopped" })).toMatchObject({ tone: "info", action: undefined })
    expect(historyRunNotice({ ...run, issue: "login_required", status: "completed" })).toMatchObject({ tone: "success", action: undefined })
  })
})
