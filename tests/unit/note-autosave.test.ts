import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useNoteAutosave } from "../../src/ui/use-note-autosave"
import { readPlannerDrafts, syncDraftGeneration } from "../../src/ui/planner-drafts"
import type { NoteDraft } from "../../src/core/planner"
import type { Request } from "../../src/messaging/protocol"

const transport = vi.hoisted(() => vi.fn())
vi.mock("../../src/messaging/protocol", () => ({ rpc: transport }))
let api: ReturnType<typeof useNoteAutosave>, root: Root, container: HTMLElement
let initial: NoteDraft, generation: string
const onIdentityChange = vi.fn()
function saved(request: Extract<Request, { type: "note_save" }>) {
  return { ...request.note, revision: request.note.expectedRevision + 1, createdAt: "2026-10-27T00:00:00Z", updatedAt: "2026-10-27T00:00:01Z" }
}
function Probe() { api = useNoteAutosave({ initial, generation, onClose: vi.fn(), onIdentityChange }); return null }
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const storage: Record<string, string> = {}
  vi.stubGlobal("localStorage", Object.defineProperties(storage, {
    getItem: { value: (key: string) => storage[key] ?? null },
    setItem: { value: (key: string, value: string) => { storage[key] = value } },
    removeItem: { value: (key: string) => { delete storage[key] } },
    clear: { value: () => { for (const key of Object.keys(storage)) delete storage[key] } }
  }))
  localStorage.clear(); generation = crypto.randomUUID(); syncDraftGeneration(generation)
  initial = { id: crypto.randomUUID(), title: "test", body: "", expectedRevision: 1, pinned: false, checklist: [] }
  transport.mockReset(); transport.mockImplementation(async (request: Extract<Request, { type: "note_save" }>) => saved(request))
  onIdentityChange.mockClear()
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
  act(() => root.render(React.createElement(Probe)))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals()
})

it("saves edits made during an in-flight request with the next revision and clears recovery only after both writes", async () => {
  let resolve!: (value: ReturnType<typeof saved>) => void
  transport.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  let flushing!: Promise<boolean>
  act(() => { api.update({ body: "first" }); flushing = api.flush() })
  act(() => api.update({ body: "second" }))
  expect(transport).toHaveBeenCalledTimes(1)
  expect(readPlannerDrafts(generation)[0]?.value.body).toBe("second")
  await act(async () => {
    resolve(saved(transport.mock.calls[0]![0]))
    expect(await flushing).toBe(true)
  })
  expect(transport).toHaveBeenCalledTimes(2)
  expect(transport.mock.calls[0]![0].note).toMatchObject({ body: "first", expectedRevision: 1 })
  expect(transport.mock.calls[1]![0]).toMatchObject({ dataGeneration: generation, note: { body: "second", expectedRevision: 2 } })
  expect(readPlannerDrafts(generation)).toEqual([])
})

it("stops automatic retries on conflict, preserves the draft and saves a copy under a new identity", async () => {
  transport.mockRejectedValueOnce(new Error("revision conflict"))
  await act(async () => { api.update({ body: "unsaved" }); expect(await api.flush()).toBe(false) })
  expect(api.error).toBe("revision conflict")
  act(() => vi.advanceTimersByTime(1000))
  expect(transport).toHaveBeenCalledTimes(1)
  expect(readPlannerDrafts(generation)[0]?.value.body).toBe("unsaved")
  await act(async () => api.saveCopy())
  expect(transport.mock.calls[1]![0].note).toMatchObject({ body: "unsaved", expectedRevision: 0 })
  expect(transport.mock.calls[1]![0].note.id).not.toBe(initial.id)
  expect(onIdentityChange).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 1, body: "unsaved" }))
  expect(readPlannerDrafts(generation)).toEqual([])
})
