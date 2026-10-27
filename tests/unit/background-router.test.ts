import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from "vitest"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"
import { SubmissionTracker } from "../../src/submission/tracker"
import { defaultSettings } from "../../src/storage/settings"
import { createRequestHandler } from "../../src/background/router"
import { rpc, type Request } from "../../src/messaging/protocol"
import type { ResponseMap, Snapshot } from "../../src/messaging/contracts"
import type { Note } from "../../src/core/planner"

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
      get: async (key: string) => ({ [key]: local[key] }), set: async (value: object) => { Object.assign(local, value) }
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

it("does not retry a failed run owned by another tab", async () => {
  history.run = { id: "run", platform: "saramin", tabId: 8, status: "error", pages: 0, processed: 0, inserted: 0, updated: 0, skipped: 0, scope: "", message: "", startedAt: "2026-10-27T00:00:00Z", updatedAt: "2026-10-27T00:00:00Z" }
  await expect(handle({ type: "history_run", operation: "retry" }, site)).rejects.toThrow()
  expect(history.start).not.toHaveBeenCalled()
})

it("checks Wanted events against the live tab instead of a stale SPA sender URL", async () => {
  const sender = { ...site, url: "https://www.wanted.co.kr/wd/123" }
  expect(await handle({ type: "submission", event: { kind: "wanted_completed", platform: "wanted", sourceJobId: "123" } }, sender)).toBe(false)
  expect(submissions.observe).not.toHaveBeenCalled()
})
