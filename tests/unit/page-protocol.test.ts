import { afterEach, expect, expectTypeOf, it, vi } from "vitest"
import { PageRequestSchema, sendPageRequest, type PageRequest, type PageResponseMap } from "../../src/messaging/page-protocol"
import type { SyncReport } from "../../src/core/model"
import type { HistoryRunPage } from "../../src/collection/history-run-model"

afterEach(() => vi.unstubAllGlobals())

it("infers each page command response and covers every command", () => {
  const sync = () => sendPageRequest(7, { type: "SYNC_PAGE" })
  const inspect = () => sendPageRequest(7, { type: "HISTORY_RUN_INSPECT" })
  expectTypeOf<keyof PageResponseMap>().toEqualTypeOf<PageRequest["type"]>()
  expectTypeOf<ReturnType<typeof sync>>().toEqualTypeOf<Promise<SyncReport>>()
  expectTypeOf<ReturnType<typeof inspect>>().toEqualTypeOf<Promise<HistoryRunPage>>()
})

it("rejects malformed ownership IDs and payloads on commands without a payload", () => {
  expect(PageRequestSchema.safeParse({ type: "SYNC_PAGE", runId: "old-run" }).success).toBe(false)
  expect(PageRequestSchema.safeParse({ type: "NEXT_PAGE", runId: crypto.randomUUID() }).success).toBe(false)
  expect(PageRequestSchema.safeParse({ type: "GET_PAGE", settings: {} }).success).toBe(false)
})

it("preserves run ownership in transport and distinguishes remote errors from disconnection", async () => {
  const sendMessage = vi.fn().mockResolvedValue({ ok: true, data: true })
  vi.stubGlobal("chrome", { tabs: { sendMessage } })
  const runId = crypto.randomUUID()
  await sendPageRequest(7, { type: "SYNC_PAGE", runId })
  expect(sendMessage).toHaveBeenCalledWith(7, { type: "SYNC_PAGE", runId })
  sendMessage.mockResolvedValueOnce({ ok: false, error: "stopped" })
  await expect(sendPageRequest(7, { type: "SYNC_PAGE", runId })).rejects.toMatchObject({ kind: "remote", message: "stopped" })
  sendMessage.mockResolvedValueOnce(undefined)
  await expect(sendPageRequest(7, { type: "GET_PAGE" })).rejects.toMatchObject({ kind: "no_response" })
  sendMessage.mockRejectedValueOnce(new Error("No tab"))
  await expect(sendPageRequest(7, { type: "GET_PAGE" })).rejects.toMatchObject({ kind: "connection_lost" })
})
