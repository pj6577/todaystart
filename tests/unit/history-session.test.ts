import { afterEach, expect, it, vi } from "vitest"
import { HistorySession } from "../../src/collection/history-session"
import type { HistoryRun } from "../../src/collection/history-run-model"
import type { CollectionResult, SyncReport } from "../../src/core/model"

const run: HistoryRun = { id: "whole-history", platform: "saramin", tabId: 7, status: "error", pages: 0, processed: 0, inserted: 0, updated: 0, skipped: 0, scope: "", message: "login", startedAt: "2026-10-27T00:00:00Z", updatedAt: "2026-10-27T00:00:00Z" }
const result: CollectionResult = { code: "ok", records: [], message: "ok", scope: "current", hasNextPage: false, skipped: 0 }
const report: SyncReport = { ...result, platform: "saramin", at: "2026-10-27T00:01:00Z", collected: 1, inserted: 1, updated: 0 }
afterEach(() => vi.useRealTimers())

it("keeps the full-history retry after login-triggered automatic collection", () => {
  const session = new HistorySession()
  session.begin(true, result, false)
  session.complete(report, false)
  expect(session.activeRun(run)).toBe(run)
  expect(session.shouldRetryRun(run)).toBe(true)
})

it("lets an explicit page import supersede an older failed run", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T00:01:00Z"))
  const session = new HistorySession()
  session.begin(false, result, false)
  session.complete(report, false)
  expect(session.activeRun(run)).toBeUndefined()
  expect(session.shouldRetryRun(run)).toBe(false)
  expect(session.singleState?.status).toBe("completed")
  expect(session.activeRun({ ...run, status: "running" })?.status).toBe("running")
})

it("retains a manual request while the list loads, then finishes it", () => {
  const session = new HistorySession()
  session.begin(false, { ...result, code: "loading" }, false)
  session.complete({ ...report, code: "loading" }, false)
  expect(session.manualPending).toBe(true)
  session.complete({ ...report, skipped: 1, code: "partial" }, false)
  expect(session.manualPending).toBe(false)
  expect(session.singleState).toMatchObject({ status: "stopped", retryable: true })
})

it("keeps reset suspension across route changes and clears it on explicit retry", () => {
  const session = new HistorySession(), initialId = session.singleId
  session.manualPending = true
  session.dataReset(); session.routeChanged()
  expect(session.resetPaused).toBe(true)
  expect(session.manualPending).toBe(false)
  session.resetWindow()
  expect(session.resetPaused).toBe(false)
  expect(session.singleId).not.toBe(initialId)
})

it("does not replace full-run UI with per-page progress", () => {
  const session = new HistorySession()
  session.begin(false, result, true); session.complete(report, true)
  expect(session.singleState).toBeUndefined()
  expect(session.singleAt).toBe(0)
})
