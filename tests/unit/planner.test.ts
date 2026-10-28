import Dexie from "dexie"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"
import { applicationIdentity } from "../../src/core/identity"
import { calendarCells, calendarWeek, eventToDraft, shiftEventDate, upcomingEvents, EventDraftSchema, type EventDraft, type NoteDraft } from "../../src/core/planner"
import { record } from "../helpers"
import { insertMention, noteLinkIds } from "../../src/core/note-mentions"

let repository: ApplicationRepository
beforeEach(() => { repository = new ApplicationRepository(new TodayStartDatabase("planner-" + crypto.randomUUID())) })
afterEach(async () => { await repository.db.delete() })
const noteDraft = (linkId?: string): NoteDraft => ({ id: crypto.randomUUID(), expectedRevision: 0, title: "면접 준비", body: "질문과 답변", pinned: false, checklist: [], linkId })
const eventDraft = (linkId?: string): EventDraft => ({ id: crypto.randomUUID(), expectedRevision: 0, title: "1차 면접", kind: "interview", date: "2026-10-23", time: "14:00", status: "planned", location: "온라인", body: "준비하기", checklist: [], linkId })

it("persists preparation independently of the appointment and round-trips it through backup", async () => {
  const legacy = await repository.saveEvent(eventDraft())
  expect(legacy.preparation).toBeUndefined()
  const ready = await repository.saveEvent({ ...eventToDraft(legacy), preparation: "ready" })
  expect(ready).toMatchObject({ date: legacy.date, time: legacy.time, status: "planned", preparation: "ready", revision: 2 })
  expect(EventDraftSchema.safeParse(eventToDraft(ready)).success).toBe(true)
  await expect(repository.saveEvent({ ...eventToDraft(legacy), preparation: "in_progress" })).rejects.toThrow("다른 창")
  const backup = await repository.backup()
  await repository.clear(); await repository.restore(backup)
  expect((await repository.plannerSnapshot()).events[0]).toMatchObject({ id: legacy.id, preparation: "ready", status: "planned", date: legacy.date, time: legacy.time })
  expect(EventDraftSchema.safeParse({ ...eventDraft(), preparation: "invalid" }).success).toBe(false)
})

it("builds Monday-to-Sunday board weeks across months, years, and leap days", () => {
  expect(calendarWeek("2026-11-01")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"])
  expect(calendarWeek("2027-01-01")[0]).toBe("2026-12-28")
  expect(calendarWeek("2028-02-29")).toContain("2028-02-29")
  expect(shiftEventDate("2026-12-31", 1)).toBe("2027-01-01")
  expect(shiftEventDate("2028-03-01", -1)).toBe("2028-02-29")
})

it("rolls back records and links when a later planner write fails during restore", async () => {
  await repository.merge([record()])
  const link = (await repository.plannerSnapshot()).links[0]!
  await repository.saveNote(noteDraft(link.id))
  await repository.saveEvent(eventDraft(link.id))
  const backup = await repository.backup()
  await repository.clear()
  const write = vi.spyOn(repository.db.notes, "put").mockRejectedValueOnce(new Error("write failed"))
  try { await expect(repository.restore(backup)).rejects.toThrow("write failed") }
  finally { write.mockRestore() }
  expect(await repository.list()).toEqual([])
  expect(await repository.plannerSnapshot()).toEqual({ links: [], notes: [], events: [] })
  await repository.restore(backup)
  expect(await repository.list()).toHaveLength(1)
  const restored = await repository.plannerSnapshot()
  expect(restored.notes[0]?.linkId).toBe(restored.links[0]?.id)
  expect(restored.events[0]?.linkId).toBe(restored.links[0]?.id)
})

it("backs up and restores sticker colors and multiple mention links, preserving text on unlink", async () => {
  const a = record(), b = record({ sourceApplicationId: "mention-other", companyName: "두 번째 기업" })
  await repository.merge([a,b])
  const links = (await repository.plannerSnapshot()).links
  const first = insertMention("@", 0, 1, links[0]!.id, "첫 기업")
  const second = insertMention(first.body + "@", first.body.length, first.body.length + 1, links[1]!.id, "둘째 기업", first.mentions)
  const saved = await repository.saveNote({ ...noteDraft(), body: second.body, mentions: second.mentions, color: "sage" })
  const backup = await repository.backup()
  await repository.clear(); await repository.restore(backup)
  const planner = await repository.plannerSnapshot(), note = planner.notes[0]!
  expect(note.color).toBe("sage"); expect(note.body).toBe(saved.body)
  expect(new Set(noteLinkIds(note))).toEqual(new Set(planner.links.map(link => link.id)))
  await repository.delete(planner.links[0]!.recordId)
  const detached = (await repository.plannerSnapshot()).notes[0]!
  expect(detached.body).toBe(saved.body); expect(detached.mentions).toHaveLength(1)
  await repository.delete(planner.links[1]!.recordId, "delete")
  expect((await repository.plannerSnapshot()).notes).toEqual([])
})
it("rejects invalid and missing mention references without saving a note", async () => {
  const selected = insertMention("@", 0, 1, crypto.randomUUID(), "기업")
  await expect(repository.saveNote({ ...noteDraft(), body: selected.body, mentions: selected.mentions })).rejects.toThrow("삭제")
  await expect(repository.saveNote({ ...noteDraft(), body: "본문 수정", mentions: selected.mentions })).rejects.toThrow("언급 위치")
  expect((await repository.plannerSnapshot()).notes).toEqual([])
})
it("remaps mention-only notes when two existing application links are consolidated", async () => {
  const attemptId = crypto.randomUUID(), pending = record({ submissionAttemptId: attemptId, status: "pending_confirmation", appliedAt: undefined }), confirmed = record({ sourceApplicationId: "mention-known", jobTitle: "다른 표기" })
  await repository.merge([pending, confirmed])
  const links = (await repository.plannerSnapshot()).links
  const bodies = links.map(link => insertMention("@", 0, 1, link.id, "기업"))
  for (const body of bodies) await repository.saveNote({ ...noteDraft(), body: body.body, mentions: body.mentions })
  await repository.merge([{ ...confirmed, submissionAttemptId: attemptId, submissionStage: "confirmed" }])
  const planner = await repository.plannerSnapshot()
  expect(planner.links).toHaveLength(1)
  expect(planner.notes.every(note => note.mentions?.[0]?.linkId === planner.links[0]?.id)).toBe(true)
})

it("upgrades a v1 database without losing records and supplies stable application links", async () => {
  const name = "legacy-planner-" + crypto.randomUUID(), legacy = new Dexie(name)
  legacy.version(1).stores({ applications: "id, platform, normalizedCompanyName, appliedAt, sourceApplicationId, sourceJobId, status" })
  await legacy.table("applications").put(record())
  legacy.close()
  const upgraded = new ApplicationRepository(new TodayStartDatabase(name))
  try { expect(await upgraded.list()).toHaveLength(1); expect((await upgraded.plannerSnapshot()).links).toHaveLength(1) }
  finally { await upgraded.db.delete() }
})

it("keeps personal data attached when a composite application is promoted to a site application ID", async () => {
  const original = record()
  await repository.merge([original])
  const link = (await repository.plannerSnapshot()).links[0]!
  const note = await repository.saveNote(noteDraft(link.id)), event = await repository.saveEvent(eventDraft(link.id))
  const incoming = { ...original, sourceApplicationId: "1234", lastSeenAt: "2026-10-25T00:00:00Z" }
  await repository.merge([{ ...incoming, id: applicationIdentity(incoming) }])
  const saved = await repository.plannerSnapshot()
  expect(await repository.list()).toHaveLength(1)
  expect(saved.links).toHaveLength(1)
  expect(saved.links[0]).toMatchObject({ id: link.id, recordId: applicationIdentity(incoming) })
  expect(saved.notes[0]).toMatchObject({ id: note.id, body: note.body, linkId: link.id })
  expect(saved.events[0]).toMatchObject({ id: event.id, linkId: link.id })
})

it("consolidates links and both sets of personal data when an existing record absorbs a pending attempt", async () => {
  const attemptId = crypto.randomUUID(), pending = record({ submissionAttemptId: attemptId, status: "pending_confirmation", submissionStage: "unverified", appliedAt: undefined }), confirmed = record({ sourceApplicationId: "already-known", jobTitle: "다른 공고 표기" })
  await repository.merge([pending, confirmed])
  const links = (await repository.plannerSnapshot()).links
  for (const link of links) await repository.saveNote(noteDraft(link.id))
  await repository.merge([{ ...confirmed, submissionAttemptId: attemptId, submissionStage: "confirmed", lastSeenAt: "2026-10-25T00:00:00Z" }])
  const snapshot = await repository.plannerSnapshot()
  expect(await repository.list()).toHaveLength(1)
  expect(snapshot.links).toHaveLength(1)
  expect(snapshot.notes).toHaveLength(2)
  expect(new Set(snapshot.notes.map(note => note.linkId))).toEqual(new Set([snapshot.links[0]!.id]))
})

it("rejects stale note and event writes instead of overwriting another window", async () => {
  const draft = noteDraft(), note = await repository.saveNote(draft)
  await expect(repository.saveNote({ ...draft, body: "stale" })).rejects.toThrow("다른 창")
  const changed = await repository.saveNote({ ...draft, expectedRevision: note.revision, body: "latest", pinned: true })
  await expect(repository.deletePlanner("note", note.id, note.revision)).rejects.toThrow("다른 창")
  expect((await repository.plannerSnapshot()).notes[0]?.body).toBe("latest")
  expect(changed.revision).toBe(2)
  const event = await repository.saveEvent(eventDraft())
  await expect(repository.saveEvent({ ...eventDraft(), id: event.id, expectedRevision: 0 })).rejects.toThrow("다른 창")
  expect((await repository.plannerSnapshot()).events[0]?.revision).toBe(1)
})

it("does not save stale deleted references or invent an application for an independent event", async () => {
  await expect(repository.saveNote(noteDraft(crypto.randomUUID()))).rejects.toThrow("삭제")
  await repository.saveEvent(eventDraft())
  expect(await repository.list()).toHaveLength(0)
})

it("retains notes and schedules as independent items by default when deleting an application", async () => {
  const application = record(); await repository.merge([application])
  const link = (await repository.plannerSnapshot()).links[0]!
  await repository.saveNote(noteDraft(link.id)); await repository.saveEvent(eventDraft(link.id))
  await repository.delete(application.id)
  const snapshot = await repository.plannerSnapshot()
  expect(snapshot.links).toHaveLength(0)
  expect(snapshot.notes[0]?.revision).toBe(2); expect(snapshot.notes[0]?.linkId).toBeUndefined()
  expect(snapshot.events[0]?.revision).toBe(2); expect(snapshot.events[0]?.linkId).toBeUndefined()
})

it("explicitly deleting linked items and resetting data clear all planner tables", async () => {
  const application = record(); await repository.merge([application])
  const link = (await repository.plannerSnapshot()).links[0]!
  await repository.saveNote(noteDraft(link.id)); await repository.saveEvent(eventDraft(link.id))
  await repository.delete(application.id, "delete")
  expect(await repository.plannerSnapshot()).toEqual({ links: [], notes: [], events: [] })
  await repository.saveNote(noteDraft()); await repository.saveEvent(eventDraft()); await repository.clear()
  expect(await repository.plannerSnapshot()).toEqual({ links: [], notes: [], events: [] })
})

it("restores v2 backups with remapped stable links and repeated restore does not duplicate personal items", async () => {
  await repository.merge([record()])
  const link = (await repository.plannerSnapshot()).links[0]!
  await repository.saveNote(noteDraft(link.id)); await repository.saveEvent(eventDraft(link.id))
  const backup = await repository.backup()
  await repository.clear(); await repository.restore(backup); await repository.restore(backup)
  const snapshot = await repository.plannerSnapshot()
  expect(snapshot.notes).toHaveLength(1); expect(snapshot.events).toHaveLength(1); expect(snapshot.links).toHaveLength(1)
  expect(snapshot.notes[0]?.linkId).toBe(snapshot.links[0]?.id)
  expect(snapshot.events[0]?.linkId).toBe(snapshot.links[0]?.id)
  expect(snapshot.links[0]?.id).not.toBe(link.id)
  const note = snapshot.notes[0]!
  await repository.db.notes.update(note.id, { body: "newer local edit", updatedAt: "2099-01-01T00:00:00Z" })
  await repository.restore(backup)
  expect((await repository.plannerSnapshot()).notes[0]?.body).toBe("newer local edit")
})

it("rejects invalid backup relationships atomically and continues to accept v1 backups", async () => {
  const backup = await repository.backup()
  const { expectedRevision, ...note } = noteDraft()
  await expect(repository.restore({ ...backup, records: [record()], notes: [{ ...note, revision: 1, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", linkId: crypto.randomUUID() }] })).rejects.toThrow("연결")
  expect(await repository.list()).toHaveLength(0)
  await repository.restore({ format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [record()] })
  expect(await repository.list()).toHaveLength(1)
})

it("restores an older composite backup into a store that already has the canonical application ID", async () => {
  const original = record(); await repository.merge([original])
  await repository.saveNote(noteDraft((await repository.plannerSnapshot()).links[0]!.id))
  const backup = await repository.backup()
  await repository.clear()
  const incoming = { ...original, sourceApplicationId: "enriched-123" }
  await repository.merge([{ ...incoming, id: applicationIdentity(incoming) }])
  await repository.restore(backup)
  const planner = await repository.plannerSnapshot()
  expect(await repository.list()).toHaveLength(1)
  expect(planner.notes[0]?.linkId).toBe(planner.links[0]?.id)
})

it.each(["100", undefined])("preserves an undated edited application's identity across repeated backup restore (%s)", async sourceJobId => {
  const original = record({ sourceJobId }); await repository.merge([original])
  await repository.edit(original.id, { companyName: original.companyName, jobTitle: original.jobTitle, appliedAt: undefined, status: "applied" })
  await repository.saveNote(noteDraft((await repository.plannerSnapshot()).links[0]!.id))
  const backup = await repository.backup()
  await repository.clear(); await repository.restore(backup); await repository.restore(backup)
  expect(await repository.list()).toHaveLength(1)
  expect((await repository.plannerSnapshot()).notes).toHaveLength(1)
})

it("reserves six weeks for every month and includes future dates", () => {
  for (const month of ["2026-02", "2026-08", "2028-02"]) {
    const cells = calendarCells(month)
    expect(cells).toHaveLength(42)
    expect(new Date(cells[0]! + "T00:00:00Z").getUTCDay()).toBe(1)
    expect(cells).toContain(month + "-28")
  }
  expect(calendarCells("2028-02")).toContain("2028-02-29")
})

it("excludes elapsed appointments and finished events while keeping unknown-time deadlines", async () => {
  const past = await repository.saveEvent({ ...eventDraft(), date: "2026-10-21", time: "09:00" })
  const undatedTime = await repository.saveEvent({ ...eventDraft(), date: "2026-10-21", time: undefined })
  const future = await repository.saveEvent(eventDraft())
  const done = await repository.saveEvent({ ...eventDraft(), status: "completed" })
  expect(upcomingEvents([past, undatedTime, future, done], "2026-10-21", "10:00").map(item => item.id)).toEqual([undatedTime.id, future.id])
  expect(EventDraftSchema.safeParse({ ...eventDraft(), time: "25:00" }).success).toBe(false)
  expect(EventDraftSchema.safeParse({ ...eventDraft(), url: "javascript:alert(1)" }).success).toBe(false)
})
