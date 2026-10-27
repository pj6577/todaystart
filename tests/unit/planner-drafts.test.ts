import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createDraftSession, readPlannerDrafts, syncDraftGeneration } from "../../src/ui/planner-drafts"
import { requestErrorMessage } from "../../src/messaging/protocol"
import type { EventDraft, NoteDraft } from "../../src/core/planner"

beforeEach(() => {
  // Node 25 exposes a non-browser localStorage; use a fresh browser-like store.
  const values: Record<string, string> = {}
  vi.stubGlobal("localStorage", new Proxy(values, { get(target, name) {
    if (name === "getItem") return (key: string) => target[key] ?? null
    if (name === "setItem") return (key: string, value: string) => { target[key] = value }
    if (name === "removeItem") return (key: string) => { delete target[key] }
    return target[name as string]
  } }))
  syncDraftGeneration()
})
afterEach(() => vi.unstubAllGlobals())
const note = (): NoteDraft => ({ id: crypto.randomUUID(), expectedRevision: 0, title: "", body: "이어 쓸 내용", pinned: false, checklist: [] })

it("preserves an incomplete event without registering a real calendar event", () => {
  const value: EventDraft = { id: crypto.randomUUID(), expectedRevision: 0, title: "", kind: "interview", date: "", time: "", url: "https://", status: "planned", body: "준비물", location: "", checklist: [] }
  createDraftSession("event").write(value)
  expect(readPlannerDrafts()[0]?.value).toEqual(value)
})
it("keeps another window's draft when one session is saved", () => {
  const a = createDraftSession("note"), b = createDraftSession("note"), value = note()
  a.write(value); b.write({ ...value, body: "다른 창" }); a.clear()
  expect(readPlannerDrafts()).toHaveLength(1)
  expect(readPlannerDrafts()[0]?.value.body).toBe("다른 창")
})
it("moves a recovered copy into its own editing session and clears it on save", () => {
  const original = createDraftSession("note"), value = note()
  original.write(value)
  const recovered = readPlannerDrafts()[0]!, next = createDraftSession("note", undefined, recovered)
  next.write({ ...value, body: "이어서 작성" })
  expect(readPlannerDrafts()).toHaveLength(1)
  next.clear()
  expect(readPlannerDrafts()).toEqual([])
})
it("clears drafts on reset and rejects writes from an older open editor", () => {
  const generation = crypto.randomUUID()
  syncDraftGeneration(generation)
  const session = createDraftSession("note", generation)
  session.write(note())
  syncDraftGeneration(crypto.randomUUID())
  expect(readPlannerDrafts(generation)).toEqual([])
  expect(() => session.write(note())).toThrow("초기화")
})
it("ignores malformed draft storage", () => {
  localStorage.setItem("todaystart:planner-draft:broken", "not-json")
  localStorage.setItem("todaystart:planner-draft:invalid", JSON.stringify({ kind: "event", value: {} }))
  expect(readPlannerDrafts()).toEqual([])
})
it("explains a legacy background discriminator error without hiding other errors", () => {
  const legacy = JSON.stringify([{ code: "invalid_union_discriminator", path: ["type"], options: ["snapshot", "backup"], message: "Invalid discriminator value" }])
  expect(requestErrorMessage(legacy)).toContain("이전 버전의 백그라운드")
  expect(requestErrorMessage(legacy)).toContain("chrome://extensions")
  expect(requestErrorMessage("다른 창에서 메모가 변경되었어요.")).toBe("다른 창에서 메모가 변경되었어요.")
  const validation = JSON.stringify([{ code: "invalid_union_discriminator", path: ["note", "type"] }])
  expect(requestErrorMessage(validation)).toBe(validation)
})
