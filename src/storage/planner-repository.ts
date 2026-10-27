import type { TodayStartDatabase } from "./database"
import { CareerEventSchema, NoteSchema, NoteDraftSchema, EventDraftSchema } from "../core/planner"
import { noteLinkIds, validMentions } from "../core/note-mentions"
import { emptyNoteBoard, NoteLayoutChangeSchema, orderedNoteIds, moveNote } from "../core/note-board"

export class PlannerRepository {
  constructor(private readonly db: TodayStartDatabase) {}
  async snapshot() { return this.db.transaction("r", [this.db.applicationLinks, this.db.notes, this.db.events, this.db.noteBoards], async () => { const board = (await this.db.noteBoards.get("main"))?.state; return { links: await this.db.applicationLinks.toArray(), notes: await this.db.notes.toArray(), events: await this.db.events.toArray(), ...(board ? { board } : {}) } }) }
  async changeNoteLayout(input: unknown) {
    const change = NoteLayoutChangeSchema.parse(input)
    return this.db.transaction("rw", [this.db.notes, this.db.noteBoards], async () => {
      const notes = await this.db.notes.toArray(), board = (await this.db.noteBoards.get("main"))?.state || emptyNoteBoard()
      if (!notes.some(note => note.id === change.id) || change.kind === "move" && change.beforeId && !notes.some(note => note.id === change.beforeId)) throw new Error("메모가 삭제되었어요. 보드를 다시 확인해 주세요.")
      const next = { ...board, order: orderedNoteIds(notes, board), sizes: { ...board.sizes }, revision: board.revision + 1, updatedAt: new Date().toISOString() }
      if (change.kind === "move") next.order = moveNote(next.order, change.id, change.beforeId)
      else next.sizes[change.id] = change.size
      await this.db.noteBoards.put({ id: "main", state: next }); return next
    })
  }
  async pruneNoteBoard() {
    const stored = await this.db.noteBoards.get("main"); if (!stored) return
    const ids = new Set(await this.db.notes.toCollection().primaryKeys()), board = stored.state
    if (!ids.size) { await this.db.noteBoards.delete("main"); return }
    await this.db.noteBoards.put({ id: "main", state: { ...board, order: board.order.filter(id => ids.has(id)), sizes: Object.fromEntries(Object.entries(board.sizes).filter(([id]) => ids.has(id))), revision: board.revision + 1, updatedAt: new Date().toISOString() } })
  }
  async saveNote(input: unknown) {
    const draft = NoteDraftSchema.parse(input)
    return this.db.transaction("rw", [this.db.notes, this.db.applicationLinks, this.db.noteBoards], async () => {
      const current = await this.db.notes.get(draft.id)
      if ((current?.revision || 0) !== draft.expectedRevision) throw new Error("다른 창에서 메모가 변경되었어요. 내용을 별도 메모로 저장하거나 최신 내용을 다시 확인해 주세요.")
      if (draft.linkId && !await this.db.applicationLinks.get(draft.linkId)) throw new Error("연결된 지원 기록이 삭제되었어요. 일반 메모로 변경해 주세요.")
      if (validMentions(draft.body, draft.mentions).length !== (draft.mentions || []).length) throw new Error("기업 언급 위치가 바뀌었어요. 해당 기업을 다시 선택해 주세요.")
      for (const linkId of noteLinkIds(draft)) if (!await this.db.applicationLinks.get(linkId)) throw new Error("언급한 지원 기록이 삭제되었어요. 해당 기업 언급을 해제해 주세요.")
      const { expectedRevision, ...fields } = draft, now = new Date().toISOString()
      const note = NoteSchema.parse({ ...fields, revision: expectedRevision + 1, createdAt: current?.createdAt || now, updatedAt: now })
      const board = (await this.db.noteBoards.get("main"))?.state
      const previousNotes = await this.db.notes.toArray(), order = orderedNoteIds(previousNotes, board)
      if (!current) { const pinned = new Set(previousNotes.filter(item => item.pinned).map(item => item.id)), firstOrdinary = order.findIndex(id => !pinned.has(id)); order.splice(firstOrdinary < 0 ? order.length : firstOrdinary, 0, note.id) }
      if (note.pinned && !current?.pinned) { const index = order.indexOf(note.id); if (index >= 0) order.splice(index, 1); order.unshift(note.id) }
      await this.db.notes.put(note)
      if (!board || !current || current.pinned !== note.pinned) await this.db.noteBoards.put({ id: "main", state: { ...(board || emptyNoteBoard()), order, revision: (board?.revision || 0) + 1, updatedAt: now } })
      return note
    })
  }
  async saveEvent(input: unknown) {
    const draft = EventDraftSchema.parse(input)
    return this.db.transaction("rw", [this.db.events, this.db.applicationLinks], async () => {
      const current = await this.db.events.get(draft.id)
      if ((current?.revision || 0) !== draft.expectedRevision) throw new Error("다른 창에서 일정이 변경되었어요. 최신 일정을 다시 열어 주세요.")
      if (draft.linkId && !await this.db.applicationLinks.get(draft.linkId)) throw new Error("연결된 지원 기록이 삭제되었어요. 연결을 해제해 주세요.")
      const { expectedRevision, ...fields } = draft, now = new Date().toISOString()
      const event = CareerEventSchema.parse({ ...fields, revision: expectedRevision + 1, createdAt: current?.createdAt || now, updatedAt: now })
      await this.db.events.put(event); return event
    })
  }
  async deletePlanner(kind: "note" | "event", id: string, revision: number) {
    const table = kind === "note" ? this.db.notes : this.db.events
    return this.db.transaction("rw", [table, this.db.notes, this.db.noteBoards], async () => {
      const current = await table.get(id)
      if (!current || current.revision !== revision) throw new Error("다른 창에서 내용이 변경되었어요. 최신 내용을 다시 확인해 주세요.")
      await table.delete(id)
      if (kind === "note") await this.pruneNoteBoard()
    })
  }
}
