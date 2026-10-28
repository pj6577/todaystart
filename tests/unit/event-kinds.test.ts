import { afterEach, beforeEach, expect, it } from "vitest"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"
import { configuredEventKinds, EventKindChangeSchema, mergeEventKindConfigs } from "../../src/core/event-kinds"
import { eventToDraft, type EventDraft } from "../../src/core/planner"

let repository: ApplicationRepository
beforeEach(() => { repository = new ApplicationRepository(new TodayStartDatabase("event-kinds-" + crypto.randomUUID())) })
afterEach(async () => { await repository.db.delete() })
const draft = (kind = "interview"): EventDraft => ({ id: crypto.randomUUID(), expectedRevision: 0, title: "면접 일정", kind, date: "2026-10-28", time: "12:00", status: "planned", preparation: "in_progress", location: "온라인", body: "준비 중인 내용", checklist: [{ id: crypto.randomUUID(), text: "예상 질문", done: true }] })

it("renames, reorders, and adds kinds without changing existing event data", async () => {
  const event = await repository.saveEvent(draft()), custom = { id: `custom:${crypto.randomUUID()}`, label: "커피챗" }
  const kinds = [custom, ...configuredEventKinds().map(kind => kind.id === "interview" ? { ...kind, label: "직무 면접" } : kind)]
  const config = await repository.saveEventKinds({ kinds, expectedRevision: 0, fallbackId: "other" })
  expect(config.kinds[0]).toEqual(custom)
  expect((await repository.plannerSnapshot()).events[0]).toEqual(event)
  const saved = await repository.saveEvent(draft(custom.id))
  expect(saved.kind).toBe(custom.id)
  await expect(repository.saveEvent(draft(`custom:${crypto.randomUUID()}`))).rejects.toThrow("삭제")
})

it("reassigns a removed kind atomically and rejects stale event and kind edits", async () => {
  const original = await repository.saveEvent(draft())
  const kinds = configuredEventKinds().filter(kind => kind.id !== "interview")
  const config = await repository.saveEventKinds({ kinds, expectedRevision: 0, fallbackId: "other" })
  const event = (await repository.plannerSnapshot()).events[0]!
  expect(event).toMatchObject({ kind: "other", revision: 2, date: original.date, time: original.time, preparation: original.preparation, checklist: original.checklist, body: original.body })
  await expect(repository.saveEvent({ ...eventToDraft(original), body: "stale" })).rejects.toThrow("다른 창")
  await expect(repository.saveEventKinds({ kinds, expectedRevision: 0, fallbackId: "other" })).rejects.toThrow("다른 창")
  await expect(repository.saveEventKinds({ kinds, expectedRevision: config.revision, fallbackId: "interview" })).rejects.toThrow()
  expect((await repository.plannerSnapshot()).events[0]).toEqual(event)
})

it("backs up custom kind names and order and restores them with their events", async () => {
  const custom = { id: `custom:${crypto.randomUUID()}`, label: "채용 상담" }
  await repository.saveEventKinds({ kinds: [custom], expectedRevision: 0, fallbackId: custom.id })
  const event = await repository.saveEvent(draft(custom.id)), backup = await repository.backup()
  await repository.clear()
  expect((await repository.plannerSnapshot()).eventKindConfig).toBeUndefined()
  await repository.restore(backup)
  const restored = await repository.plannerSnapshot()
  expect(restored.eventKindConfig?.kinds).toEqual([custom])
  expect(restored.events[0]).toMatchObject({ id: event.id, kind: custom.id, date: event.date, preparation: "in_progress" })
  await expect(repository.restore({ ...backup, eventKindConfig: undefined })).rejects.toThrow("사용자 일정 종류")
})

it("keeps local custom kinds when restoring older backups and avoids duplicate visible labels", () => {
  const id = `custom:${crypto.randomUUID()}`
  const local = { kinds: [{ id, label: "면접" }], revision: 4, updatedAt: "2026-10-28T12:00:00Z" }
  const incoming = { kinds: configuredEventKinds(), revision: 1, updatedAt: "2026-10-27T12:00:00Z" }
  const merged = mergeEventKindConfigs(local, incoming, [{ kind: id }, { kind: "interview" }])!
  expect(merged.kinds).toEqual([{ id, label: "면접" }, { id: "interview", label: "면접 (2)" }])
  expect(merged.revision).toBe(5)
})

it("rejects empty lists, duplicate names or IDs, and invalid identifiers", () => {
  const valid = { kinds: configuredEventKinds(), expectedRevision: 0, fallbackId: "other" }
  expect(EventKindChangeSchema.safeParse({ ...valid, kinds: [] }).success).toBe(false)
  expect(EventKindChangeSchema.safeParse({ ...valid, kinds: [{ id: "interview", label: " 면접 " }, { id: "other", label: "면접" }] }).success).toBe(false)
  expect(EventKindChangeSchema.safeParse({ ...valid, kinds: [{ id: "other", label: "A" }, { id: "other", label: "B" }] }).success).toBe(false)
  expect(EventKindChangeSchema.safeParse({ ...valid, fallbackId: "invalid" }).success).toBe(false)
})
