import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { webcrypto } from "node:crypto"
import { startHistoryRun, resumeHistoryRun, stopHistoryRun } from "../../src/collection/history-run"
import type { HistoryRunPage } from "../../src/collection/history-run-model"

vi.mock("../../src/storage/settings", () => ({ getSettings: async () => ({ consent: { saramin: true } }) }))
vi.mock("../../src/storage/history-completions", () => ({ getHistoryCompletions: vi.fn(), rememberHistoryCompletion: vi.fn() }))
vi.mock("../../src/collection/policy", () => ({ collectionPolicy: { historyReadyTimeoutMs: 1000, historyPollIntervalMs: 1, maxPagesPerRun: 100 } }))

const url = "https://www.saramin.co.kr/zf_user/persons/apply-status-list"
let session: Record<string, any>
let inspect: ReturnType<typeof vi.fn>
let tabsGet: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>
const page: HistoryRunPage = { url, fingerprint: "page-one", code: "ok", scope: "현재 조건", currentPage: 1, hasNextPage: true, hasFirstPage: false, paginationFound: true, endKnown: false }
beforeEach(() => {
  session = {}
  inspect = vi.fn().mockResolvedValue(page)
  tabsGet = vi.fn().mockResolvedValue({ id: 7, url, status: "complete" })
  send = vi.fn(async (_tabId, message) => ({ ok: true, data: message.type === "HISTORY_RUN_INSPECT" ? await inspect() : message.type === "SYNC_PAGE" ? { code: "ok", collected: 1, inserted: 1, updated: 0, skipped: 0, scope: "현재 조건" } : true }))
  vi.stubGlobal("crypto", webcrypto)
  vi.stubGlobal("chrome", { tabs: { get: tabsGet, sendMessage: send }, storage: { session: {
    get: async (key: string) => ({ [key]: session[key] }), set: async (value: object) => { Object.assign(session, value) }
  } } })
})
afterEach(async () => { await new Promise(resolve => setTimeout(resolve, 1)); vi.unstubAllGlobals() })
async function collect() { await startHistoryRun(7); await resumeHistoryRun(); return session.historyRun }

describe("수집기가 확인한 오류 종류", () => {
  it("로그인 화면을 실제 감지한 결과를 저장한다", async () => {
    inspect.mockResolvedValue({ ...page, code: "login_required" })
    expect(await collect()).toMatchObject({ status: "error", issue: "login_required", pages: 0 })
  })
  it("로딩/인식 실패를 로그인 실패로 추측하지 않는다", async () => {
    inspect.mockResolvedValue({ ...page, code: "loading" })
    expect(await collect()).toMatchObject({ status: "error", issue: "list_unreadable", pages: 0 })
  })
  it("다음 페이지로 이동했는데 같은 목록이면 이동 실패로 구분한다", async () => {
    expect(await collect()).toMatchObject({ status: "error", issue: "navigation_failed", pages: 1, inserted: 1 })
  })
  it("지원 현황 연결 실패를 구분한다", async () => {
    send.mockRejectedValue(new Error("Receiving end does not exist"))
    expect(await collect()).toMatchObject({ status: "error", issue: "connection_lost", pages: 0 })
  })
  it("탭 닫힘과 주소 변경을 구분한다", async () => {
    await startHistoryRun(7)
    tabsGet.mockRejectedValue(new Error("No tab"))
    await resumeHistoryRun()
    expect(session.historyRun).toMatchObject({ status: "error", issue: "tab_closed" })
    tabsGet.mockResolvedValue({ id: 7, url, status: "complete" })
    await startHistoryRun(7)
    tabsGet.mockResolvedValue({ id: 7, url: "https://www.saramin.co.kr/", status: "complete" })
    await resumeHistoryRun()
    expect(session.historyRun).toMatchObject({ status: "error", issue: "context_changed" })
  })
  it("사용자가 중지한 결과를 오류로 바꾸지 않는다", async () => {
    await startHistoryRun(7)
    await stopHistoryRun()
    await resumeHistoryRun()
    expect(session.historyRun).toMatchObject({ status: "stopped", issue: "user_stopped" })
  })
})
