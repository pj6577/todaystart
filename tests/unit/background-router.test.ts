import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from "vitest"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"
import { SubmissionTracker } from "../../src/submission/tracker"
import { defaultSettings } from "../../src/storage/settings"
import { createRequestHandler } from "../../src/background/router"
import { rpc, type Request } from "../../src/messaging/protocol"
import type { ResponseMap, Snapshot } from "../../src/messaging/contracts"
import type { Note } from "../../src/core/planner"
import { record } from "../helpers"

const history = vi.hoisted(() => ({ run: undefined as import("../../src/collection/history-run-model").HistoryRun | undefined, start: vi.fn(), stop: vi.fn().mockResolvedValue(true) }))
vi.mock("../../src/collection/history-run", () => ({ getHistoryRun: async () => history.run, resumeHistoryRun: vi.fn(), startHistoryRun: history.start, stopHistoryRun: history.stop }))
vi.mock("../../src/storage/history-completions", () => ({ getHistoryCompletions: async () => ({}) }))

let repository: ApplicationRepository, submissions: SubmissionTracker, handle: ReturnType<typeof createRequestHandler>
let local: Record<string, unknown>
const ui = { id: "extension", url: "chrome-extension://extension/options.html" }
const site = { id: "extension", url: "https://www.saramin.co.kr/zf_user/persons/apply-status-list", frameId: 0, tab: { id: 7 } as chrome.tabs.Tab }
const draft = () => ({ id: crypto.randomUUID(), expectedRevision: 0, title: "test", body: "", checklist: [], pinned: false })

beforeEach(() => {
  history.run = undefined; history.start.mockClear(); history.stop.mockClear()
  repository = new ApplicationRepository(new TodayStartDatabase("router-" + crypto.randomUUID()))
  submissions = new SubmissionTracker(repository)
  vi.spyOn(submissions, "snapshot").mockResolvedValue([])
  vi.spyOn(submissions, "observe").mockResolvedValue(true)
  local = { settings: structuredClone(defaultSettings), reports: {}, dataGeneration: crypto.randomUUID() }
  vi.stubGlobal("chrome", {
    runtime: { id: "extension", getURL: (path: string) => "chrome-extension://extension/" + path },
    storage: { local: {
      get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(local[key])])), set: async (value: object) => { Object.assign(local, value) }
    } }, tabs: { get: async () => ({ url: "https://www.wanted.co.kr/wd/999" }) }
  })
  handle = createRequestHandler({ repository, submissions })
})
afterEach(async () => { await repository.db.delete(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it("infers responses from request discriminants and covers every request", () => {
  expectTypeOf<keyof ResponseMap>().toEqualTypeOf<Request["type"]>()
  const snapshot = () => rpc({ type: "snapshot" })
  const note = () => rpc({ type: "note_save", note: draft() })
  expectTypeOf<ReturnType<typeof snapshot>>().toEqualTypeOf<Promise<Snapshot>>()
  expectTypeOf<ReturnType<typeof note>>().toEqualTypeOf<Promise<Note>>()
})

it.each([
  { ...site, id: "other" },
  { ...site, frameId: 1 },
  { ...site, url: "https://www.saramin.co.kr.evil.example/" }
])("rejects unauthorized snapshot senders", async sender => {
  await expect(handle({ type: "snapshot" }, sender)).rejects.toThrow()
})

it.each(["planner_snapshot", "backup", "reset_data"])("limits %s to extension UI", async type => {
  await expect(handle({ type }, site)).rejects.toThrow()
})

it("redacts planner and other-tab history state from content snapshots", async () => {
  history.run = { id: "run", platform: "saramin", tabId: 8, status: "error", pages: 0, processed: 0, inserted: 0, updated: 0, skipped: 0, scope: "", message: "", startedAt: "2026-10-27T00:00:00Z", updatedAt: "2026-10-27T00:00:00Z" }
  const content = await handle({ type: "snapshot" }, site) as Snapshot
  expect(content.historyRun).toBeUndefined(); expect(content.planner).toBeUndefined()
  expect(content.submissionAttempts).toBeUndefined(); expect(submissions.snapshot).not.toHaveBeenCalled()
  const full = await handle({ type: "snapshot" }, ui) as Snapshot
  expect(full.historyRun?.tabId).toBe(8); expect(full.planner?.notes).toEqual([])
})

it("rejects stale writes before saving and publishes only planner invalidation on success", async () => {
  const note = draft()
  await expect(handle({ type: "note_save", note, dataGeneration: crypto.randomUUID() }, ui)).rejects.toThrow()
  expect((await repository.plannerSnapshot()).notes).toEqual([])
  expect(local.plannerRevision).toBeUndefined()
  await handle({ type: "note_save", note, dataGeneration: local.dataGeneration }, ui)
  expect((await repository.plannerSnapshot()).notes).toHaveLength(1)
  expect(local.plannerRevision).toEqual(expect.any(String)); expect(local.revision).toBeUndefined()
})

it("links a manually resolved attempt, rejects stale or mismatched context, and merges a pending record", async () => {
  const attempt = { id: crypto.randomUUID(), platform: "wanted" as const, tabId: 1, frameId: 0, sourceJobId: "100", stage: "unverified" as const, reason: "timeout" as const, startedAt: "2026-10-20T01:00:00Z", updatedAt: "2026-10-20T01:00:00Z" }
  vi.mocked(submissions.snapshot).mockResolvedValue([attempt])
  const reconcile = vi.spyOn(submissions, "reconcile").mockResolvedValue()
  const request = { type: "manual_create", submissionAttemptId: attempt.id, dataGeneration: local.dataGeneration, application: { platform: "wanted", companyName: "확인한 기업", jobTitle: "개발자", appliedAt: "2026-10-20", status: "applied", jobUrl: "https://www.wanted.co.kr/wd/100" } }
  await expect(handle({ ...request, dataGeneration: crypto.randomUUID() }, ui)).rejects.toThrow("초기화")
  await expect(handle({ ...request, submissionAttemptId: crypto.randomUUID() }, ui)).rejects.toThrow("변경")
  await expect(handle({ ...request, application: { ...request.application, platform: "jobkorea" } }, ui)).rejects.toThrow("변경")
  await expect(handle({ ...request, application: { ...request.application, jobUrl: "https://www.wanted.co.kr/wd/999" } }, ui)).rejects.toThrow("다른 공고")
  expect(await repository.list()).toHaveLength(0)
  await repository.merge([record({ platform: "wanted", companyName: "확인한 기업", sourceJobId: "100", sourceApplicationId: undefined, appliedAt: undefined, status: "pending_confirmation", submissionAttemptId: attempt.id, submissionStage: "unverified" })])
  await handle(request, ui)
  expect(await repository.list()).toHaveLength(1)
  expect((await repository.list())[0]).toMatchObject({ companyName: "확인한 기업", sourceJobId: "100", appliedAt: "2026-10-20", status: "applied", submissionAttemptId: attempt.id, submissionStage: "confirmed", evidence: "manual" })
  expect(reconcile).toHaveBeenCalledTimes(1)
})

it("limits kind management to the current extension generation and invalidates the planner", async () => {
  const change = { kinds: [{ id: "other", label: "내 일정" }], expectedRevision: 0, fallbackId: "other" }
  await expect(handle({ type: "event_kinds_save", change, dataGeneration: local.dataGeneration }, site)).rejects.toThrow()
  await expect(handle({ type: "event_kinds_save", change, dataGeneration: crypto.randomUUID() }, ui)).rejects.toThrow("초기화")
  await handle({ type: "event_kinds_save", change, dataGeneration: local.dataGeneration }, ui)
  expect((await repository.plannerSnapshot()).eventKindConfig?.kinds).toEqual(change.kinds)
  expect(local.plannerRevision).toEqual(expect.any(String))
  expect(local.revision).toBeUndefined()
})

it("does not retry a failed run owned by another tab", async () => {
  history.run = { id: "run", platform: "saramin", tabId: 8, status: "error", pages: 0, processed: 0, inserted: 0, updated: 0, skipped: 0, scope: "", message: "", startedAt: "2026-10-27T00:00:00Z", updatedAt: "2026-10-27T00:00:00Z" }
  await expect(handle({ type: "history_run", operation: "retry" }, site)).rejects.toThrow()
  expect(history.start).not.toHaveBeenCalled()
})

it("reconciles an imported completed application even without a materialized pending record", async () => {
  const id = crypto.randomUUID()
  local.submissionAttempts = [{ id, platform: "saramin", tabId: 7, frameId: 0, sourceJobId: "100", requestId: crypto.randomUUID(), stage: "unverified", reason: "timeout", startedAt: "2026-10-28T01:00:00Z", updatedAt: "2026-10-28T01:01:00Z" }]
  const imported = record({ sourceApplicationId: "9000", appliedAt: "2026-10-28", collectedAt: "2026-10-28T01:05:00Z", lastSeenAt: "2026-10-28T01:05:00Z", lastSyncedAt: "2026-10-28T01:05:00Z" })
  const report = await handle({ type: "collect", platform: "saramin", automatic: false, dataGeneration: local.dataGeneration, result: { code: "ok", records: [imported], skipped: 0, hasNextPage: false, scope: "현재 목록", message: "1건" } }, site)
  expect(report).toMatchObject({ collected: 1, inserted: 1 })
  expect(local.submissionAttempts).toMatchObject([{ id, stage: "confirmed", confirmationMethod: "history_page" }])
  expect((await repository.list())[0]).toMatchObject({ sourceApplicationId: "9000", submissionAttemptId: id, submissionStage: "confirmed", evidence: "history_page" })
})

it("checks Wanted events against the live tab instead of a stale SPA sender URL", async () => {
  const sender = { ...site, url: "https://www.wanted.co.kr/wd/123" }
  expect(await handle({ type: "submission", event: { kind: "wanted_completed", platform: "wanted", sourceJobId: "123" } }, sender)).toBe(false)
  expect(submissions.observe).not.toHaveBeenCalled()
})

const detailPosting = { sourceJobId: "50283630", companyName: "㈜이노가드", jobTitle: "[정규직]ERP 시스템 운영/개발", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/50283630?sc=810" }
const detailSender = () => ({ ...site, url: detailPosting.jobUrl })
const detailRequest = () => ({ type: "jobkorea_applied_status", posting: detailPosting, dataGeneration: local.dataGeneration })
it("잡코리아 상세 지원완료 보완은 Profile 없이도 권한·주소·세대를 확인하고 신규 기업만 추가한다", async () => {
  Object.assign(chrome.tabs, { get: vi.fn(async () => ({ id: 7, url: detailPosting.jobUrl } as chrome.tabs.Tab)) })
  vi.spyOn(submissions, "reconcile").mockResolvedValue()
  expect(await handle(detailRequest(), detailSender())).toEqual({ inserted: 1, updated: 0 })
  expect(await handle(detailRequest(), detailSender())).toEqual({ inserted: 0, updated: 0 })
  expect(await repository.list()).toHaveLength(1)
  expect((await repository.list())[0]).toMatchObject({ companyName: "㈜이노가드", evidence: "detail_status" })
  expect((await repository.list())[0]!.appliedAt).toBeUndefined()
  expect(submissions.reconcile).toHaveBeenCalledTimes(1)
})
it.each([
  () => ui,
  () => site,
  () => ({ ...detailSender(), frameId: 1 }),
  () => ({ ...detailSender(), url: "https://www.jobkorea.co.kr/Search/?gno=50283630" }),
  () => ({ ...detailSender(), url: "https://www.jobkorea.co.kr/Recruit/GI_Read/999" })
])("상세 지원완료 보완의 다른 출처·프레임·공고 요청을 거부한다", async sender => {
  await expect(handle(detailRequest(), sender())).rejects.toThrow()
  expect(await repository.list()).toHaveLength(0)
})
it("상세 지원완료 보완은 자동 기록·동의 끄기, 초기화와 페이지 이동을 존중한다", async () => {
  const getTab = vi.fn(async () => ({ id: 7, url: detailPosting.jobUrl } as chrome.tabs.Tab))
  Object.assign(chrome.tabs, { get: getTab })
  await expect(handle({ ...detailRequest(), dataGeneration: crypto.randomUUID() }, detailSender())).rejects.toThrow("초기화")
  await expect(handle({ ...detailRequest(), posting: { ...detailPosting, jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/999" } }, detailSender())).rejects.toThrow("주소")
  local.settings = { ...structuredClone(defaultSettings), autoRecord: false }
  await expect(handle(detailRequest(), detailSender())).rejects.toThrow("권한")
  const settings = structuredClone(defaultSettings); settings.consent.jobkorea = false; local.settings = settings
  await expect(handle(detailRequest(), detailSender())).rejects.toThrow("권한")
  local.settings = structuredClone(defaultSettings)
  getTab.mockResolvedValue({ id: 7, url: "https://www.jobkorea.co.kr/Recruit/GI_Read/999" } as chrome.tabs.Tab)
  await expect(handle(detailRequest(), detailSender())).rejects.toThrow("변경")
  expect(await repository.list()).toHaveLength(0)
})
