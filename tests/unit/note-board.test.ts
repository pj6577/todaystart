import { afterEach, beforeEach, expect, it } from "vitest"
import Dexie from "dexie"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"
import { clampNoteSize, emptyNoteBoard, moveNote, orderedNoteIds } from "../../src/core/note-board"

let repository: ApplicationRepository
beforeEach(() => { repository = new ApplicationRepository(new TodayStartDatabase("board-" + crypto.randomUUID())) })
afterEach(async () => { await repository.db.delete() })
async function add(title: string) { return repository.saveNote({ id: crypto.randomUUID(), expectedRevision: 0, title, body: "작성 내용", pinned: false, checklist: [] }) }
it("adds ordinary new notes below the pinned leading notes", async () => {
  const a = await add("고정할 메모")
  await repository.saveNote({ id: a.id, expectedRevision: a.revision, title: a.title, body: a.body, pinned: true, checklist: [] })
  const b = await add("새 메모")
  expect((await repository.plannerSnapshot()).board?.order).toEqual([a.id, b.id])
})
it("upgrades an existing v2 note database without changing saved note content", async () => {
  const name = "legacy-board-" + crypto.randomUUID(), legacy = new Dexie(name)
  legacy.version(1).stores({ applications: "id, platform, normalizedCompanyName, appliedAt, sourceApplicationId, sourceJobId, status" })
  legacy.version(2).stores({ applicationLinks: "id,&recordId,*aliases", notes: "id,linkId,updatedAt", events: "id,linkId,date,status" })
  const note = { id: crypto.randomUUID(), revision: 4, title: "기존 메모", body: "기존 내용과 색상", color: "sage", pinned: true, checklist: [], createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z" }
  await legacy.table("notes").put(note); legacy.close()
  const upgraded = new ApplicationRepository(new TodayStartDatabase(name))
  try {
    expect((await upgraded.plannerSnapshot()).notes).toEqual([note])
    await upgraded.changeNoteLayout({ kind: "resize", id: note.id, size: { width: 420, height: 400 } })
    expect((await upgraded.plannerSnapshot()).notes).toEqual([note])
  } finally { await upgraded.db.delete() }
})
it("rejects backup board references before restoring any content", async () => {
  const note = await add("보관 중"), backup = await repository.backup()
  await expect(repository.restore({ ...backup, board: { ...backup.board, order: [crypto.randomUUID()] } })).rejects.toThrow("배치")
  expect((await repository.plannerSnapshot()).notes[0]?.id).toBe(note.id)
})
it("keeps manual order stable through later edits and uses default order for legacy notes", async () => {
  const a = await add("A"), b = await add("B"), c = await add("C")
  await repository.changeNoteLayout({ kind: "move", id: a.id, beforeId: c.id })
  const before = (await repository.plannerSnapshot()).board!.order
  await repository.saveNote({ id: b.id, expectedRevision: b.revision, title: "B 수정", body: "내용", pinned: false, checklist: [] })
  expect((await repository.plannerSnapshot()).board!.order).toEqual(before)
  expect(orderedNoteIds([a,b,c], emptyNoteBoard())).toHaveLength(3)
})
it("resizing is independent of content revisions and other cards", async () => {
  const a = await add("A"), b = await add("B")
  await repository.changeNoteLayout({ kind: "resize", id: a.id, size: { width: 500, height: 480 } })
  await repository.changeNoteLayout({ kind: "resize", id: b.id, size: { width: 280, height: 280 } })
  const snapshot = await repository.plannerSnapshot()
  expect(snapshot.notes.find(note => note.id === a.id)?.revision).toBe(a.revision)
  expect(snapshot.board!.sizes[a.id]).toEqual({ width: 500, height: 480 })
  expect(snapshot.board!.sizes[b.id]).toEqual({ width: 280, height: 280 })
})
it("backs up, restores and prunes card order and sizes", async () => {
  const a = await add("A"), b = await add("B")
  await repository.changeNoteLayout({ kind: "move", id: a.id, beforeId: b.id })
  await repository.changeNoteLayout({ kind: "resize", id: a.id, size: { width: 500, height: 480 } })
  const backup = await repository.backup()
  await repository.clear(); expect((await repository.plannerSnapshot()).board).toBeUndefined()
  await repository.restore(backup)
  expect((await repository.plannerSnapshot()).board?.order).toEqual(backup.board!.order)
  expect((await repository.plannerSnapshot()).board?.sizes).toEqual(backup.board!.sizes)
  const restored = (await repository.plannerSnapshot()).notes.find(note => note.id === a.id)!
  await repository.deletePlanner("note", a.id, restored.revision)
  expect((await repository.plannerSnapshot()).board?.order).not.toContain(a.id)
  expect((await repository.plannerSnapshot()).board?.sizes[a.id]).toBeUndefined()
})
it("rejects invalid sizes and missing notes without changing the board", async () => {
  const a = await add("A"), before = (await repository.plannerSnapshot()).board
  await expect(repository.changeNoteLayout({ kind: "resize", id: a.id, size: { width: 1, height: 10000 } })).rejects.toThrow()
  await expect(repository.changeNoteLayout({ kind: "move", id: crypto.randomUUID() })).rejects.toThrow("삭제")
  expect((await repository.plannerSnapshot()).board).toEqual(before)
})
it("moves only the selected note relative to the target, preserving hidden notes", () => {
  expect(moveNote(["A","hidden","B","C"], "C", "B")).toEqual(["A","hidden","C","B"])
  expect(moveNote(["A","B"], "A")).toEqual(["B","A"])
  expect(moveNote(["A","B"], "A", "missing")).toEqual(["A","B"])
  expect(clampNoteSize(1, 2000)).toEqual({ width: 260, height: 900 })
})
