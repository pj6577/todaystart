import Dexie, { type Table } from "dexie"
import { z } from "zod"
import { ApplicationSchema, ManualApplicationSchema, type ApplicationRecord } from "../core/model"
import { normalizeCompanyName } from "../core/company"
import { applicationIdentity, mergedRecord } from "../core/identity"
import { jobIdFromUrl, safeJobUrl } from "../core/urls"
import { ApplicationLinkSchema, CareerEventSchema, NoteSchema, NoteDraftSchema, EventDraftSchema, type ApplicationLink, type Note, type CareerEvent } from "../core/planner"
import { noteLinkIds, validMentions } from "../core/note-mentions"
import { emptyNoteBoard, NoteBoardSchema, NoteLayoutChangeSchema, orderedNoteIds, moveNote, type NoteBoard } from "../core/note-board"

export class TodayStartDatabase extends Dexie {
  applications!: Table<ApplicationRecord, string>
  applicationLinks!: Table<ApplicationLink, string>
  notes!: Table<Note, string>
  events!: Table<CareerEvent, string>
  noteBoards!: Table<{ id: string; state: NoteBoard }, string>
  constructor(name = "todaystart") {
    super(name)
    this.version(1).stores({ applications: "id, platform, normalizedCompanyName, appliedAt, sourceApplicationId, sourceJobId, status" })
    this.version(2).stores({ applicationLinks: "id,&recordId,*aliases", notes: "id,linkId,updatedAt", events: "id,linkId,date,status" }).upgrade(async tx => {
      const records = await tx.table("applications").toArray() as ApplicationRecord[]
      await tx.table("applicationLinks").bulkPut(records.map(record => ({ id: crypto.randomUUID(), recordId: record.id, aliases: [record.id] })))
    })
    this.version(3).stores({ noteBoards: "id" })
  }
}
const backupBase = { format: z.literal("todaystart"), exportedAt: z.string().datetime(), records: z.array(ApplicationSchema).max(50000) }
export const BackupSchema = z.discriminatedUnion("version", [z.object({ ...backupBase, version: z.literal(1) }).strict(), z.object({ ...backupBase, version: z.literal(2), links: z.array(ApplicationLinkSchema).max(50000), notes: z.array(NoteSchema).max(10000), events: z.array(CareerEventSchema).max(10000), board: NoteBoardSchema.optional() }).strict()])

export class ApplicationRepository {
  constructor(readonly db = new TodayStartDatabase()) {}
  list() { return this.db.applications.toArray() }
  async createManual(input: unknown) {
    const draft = ManualApplicationSchema.parse(input)
    const jobUrl = draft.jobUrl ? safeJobUrl(draft.jobUrl, draft.platform) : undefined
    if (draft.jobUrl && !jobUrl) throw new Error("공고 주소는 로그인 정보가 없는 HTTPS 주소를 입력해 주세요. 기업 홈페이지 주소는 ‘직접 지원’을 선택해 주세요.")
    const now = new Date().toISOString()
    const record: Omit<ApplicationRecord, "id"> = { ...draft, sourceLabel: draft.platform === "manual" ? draft.sourceLabel : undefined, jobUrl, sourceJobId: draft.platform === "manual" ? undefined : jobIdFromUrl(jobUrl), normalizedCompanyName: normalizeCompanyName(draft.companyName), evidence: "manual" as const, collectedAt: now, lastSeenAt: now, lastSyncedAt: now }
    if (!record.normalizedCompanyName) throw new Error("기업명을 확인해 주세요.")
    if (record.platform === "manual") {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(applicationIdentity(record)))
      record.sourceApplicationId = "manual:" + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
    }
    const id = applicationIdentity(record)
    await this.merge([{ ...record, id }])
    return this.db.applications.get(id)
  }
  async merge(values: unknown[]): Promise<{ inserted: number; updated: number }> {
    const records = values.map(value => {
      const record = ApplicationSchema.parse(value)
      return ApplicationSchema.parse({ ...record, normalizedCompanyName: normalizeCompanyName(record.companyName), jobUrl: safeJobUrl(record.jobUrl, record.platform) })
    })
    let inserted = 0, updated = 0
    await this.db.transaction("rw", [this.db.applications, this.db.applicationLinks, this.db.notes, this.db.events, this.db.noteBoards], async () => {
      for (const record of records) {
        let existing = await this.db.applications.get(record.id)
        const pendingAttempt = record.submissionAttemptId && record.status === "applied" ?
          (await this.db.applications.where("sourceJobId").equals(record.sourceJobId || "").toArray()).find(candidate => candidate.platform === record.platform && candidate.submissionAttemptId === record.submissionAttemptId && candidate.status === "pending_confirmation") : undefined
        if (!existing && pendingAttempt) existing = pendingAttempt
        if (!existing && record.status === "applied" && record.sourceJobId) {
          const candidates = (await this.db.applications.where("sourceJobId").equals(record.sourceJobId).toArray()).filter(r =>
            r.platform === record.platform && r.status === "pending_confirmation" && r.normalizedCompanyName === record.normalizedCompanyName && r.jobTitle === record.jobTitle && (!r.submissionAttemptId || (!!record.appliedAt && record.appliedAt >= new Date(Date.parse(r.collectedAt) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10))))
          if (candidates.length === 1) existing = candidates[0]
        }
        // A date-based record can be promoted to a stable application ID once it becomes available.
        if (!existing && record.sourceApplicationId && record.appliedAt) {
          const legacyId = applicationIdentity({ ...record, sourceApplicationId: undefined })
          existing = await this.db.applications.get(legacyId)
        }
        if (!existing && record.platform === "wanted" && record.sourceCreatedAt) {
          const legacyId = applicationIdentity({ ...record, sourceApplicationId: undefined })
          if (record.sourceApplicationId) existing = await this.db.applications.get(legacyId)
          else {
            const candidates = (await this.db.applications.where("normalizedCompanyName").equals(record.normalizedCompanyName).toArray()).filter(candidate => candidate.platform === "wanted" && candidate.sourceApplicationId && applicationIdentity({ ...candidate, sourceApplicationId: undefined }) === legacyId)
            if (candidates.length === 1) existing = candidates[0]
          }
        }
        // The inspected Jobkorea button has a clean title, while the old link
        // parser included its trailing deadline. Promote that precise legacy
        // variant only; don't merge different roles or ambiguous applications.
        if (!existing && record.platform === "jobkorea" && record.evidence === "history_page" && record.sourceApplicationId && record.sourceJobId && record.appliedAt) {
          const sameEvent = (candidate: ApplicationRecord) => candidate.platform === record.platform && candidate.sourceJobId === record.sourceJobId && candidate.appliedAt === record.appliedAt && candidate.normalizedCompanyName === record.normalizedCompanyName
          const incomingIds = new Set(records.filter(sameEvent).map(candidate => candidate.sourceApplicationId).filter(Boolean))
          if (incomingIds.size === 1) {
            const candidates = (await this.db.applications.where("sourceJobId").equals(record.sourceJobId).toArray()).filter(candidate =>
              sameEvent(candidate) && !candidate.sourceApplicationId && candidate.evidence === "history_page" && candidate.jobTitle.replace(/\s*\(~\s*\d{1,2}\/\d{1,2}\)\s*$/, "").trim() === record.jobTitle.trim())
            if (candidates.length === 1) existing = candidates[0]
          }
        }
        if (!existing && !record.sourceApplicationId && record.appliedAt) {
          const candidates = (await this.db.applications.where("appliedAt").equals(record.appliedAt).toArray()).filter(r =>
            !!r.sourceApplicationId && applicationIdentity({ ...r, sourceApplicationId: undefined }) === record.id)
          if (candidates.length === 1) existing = candidates[0]
        }
        if (existing) {
          const merged = mergedRecord(existing, record)
          if ((record.sourceApplicationId && !existing.sourceApplicationId) ||
            (existing.status === "pending_confirmation" && record.status === "applied" && record.submissionAttemptId && record.submissionAttemptId === existing.submissionAttemptId)) {
            await this.db.applications.delete(existing.id)
            merged.id = record.id
          }
          await this.db.applications.put(merged)
          await this.linkApplication(merged.id, [existing.id, record.id, ...(pendingAttempt ? [pendingAttempt.id] : [])])
          if (pendingAttempt && pendingAttempt.id !== merged.id) await this.db.applications.delete(pendingAttempt.id)
          updated++
        } else { await this.db.applications.put(record); await this.linkApplication(record.id); inserted++ }
      }
    })
    return { inserted, updated }
  }
  async edit(id: string, changes: Pick<ApplicationRecord, "companyName" | "jobTitle" | "appliedAt" | "status">) {
    const existing = await this.db.applications.get(id)
    if (!existing) throw new Error("기록을 찾을 수 없습니다.")
    const record = ApplicationSchema.parse({ ...existing, ...changes, sourceStatus: changes.status !== existing.status ? undefined : existing.sourceStatus, appliedAtTime: changes.appliedAt !== existing.appliedAt ? undefined : existing.appliedAtTime, submissionStage: changes.status === "applied" ? "confirmed" : existing.submissionStage, normalizedCompanyName: normalizeCompanyName(changes.companyName), evidence: "manual" })
    await this.db.applications.put(record)
    return record
  }
  private async linkApplication(recordId: string, previousIds: string[] = []) {
    const links = await this.db.applicationLinks.where("recordId").anyOf([...new Set([recordId, ...previousIds])]).toArray()
    const preferred = links.find(link => previousIds.includes(link.recordId)) || links[0]
    const id = preferred?.id || crypto.randomUUID()
    for (const other of links.filter(link => link.id !== id)) {
      await this.db.notes.filter(note => noteLinkIds(note).includes(other.id)).modify(note => { if (note.linkId === other.id) note.linkId = id; if (note.mentions) note.mentions = note.mentions.map(mention => mention.linkId === other.id ? { ...mention, linkId: id } : mention); note.revision++ })
      await this.db.events.where("linkId").equals(other.id).modify(event => { event.linkId = id; event.revision++ })
      await this.db.applicationLinks.delete(other.id)
    }
    await this.db.applicationLinks.put({ id, recordId, aliases: [...new Set([...links.flatMap(link => link.aliases), ...previousIds, recordId])].slice(-200) })
    return id
  }
  async plannerSnapshot() { return this.db.transaction("r", [this.db.applicationLinks, this.db.notes, this.db.events, this.db.noteBoards], async () => { const board = (await this.db.noteBoards.get("main"))?.state; return { links: await this.db.applicationLinks.toArray(), notes: await this.db.notes.toArray(), events: await this.db.events.toArray(), ...(board ? { board } : {}) } }) }
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
  private async pruneNoteBoard() {
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
  async delete(id: string, linked: "keep" | "delete" = "keep") {
    await this.db.transaction("rw", [this.db.applications, this.db.applicationLinks, this.db.notes, this.db.events, this.db.noteBoards], async () => {
      const link = await this.db.applicationLinks.where("recordId").equals(id).first()
      if (link) {
        if (linked === "delete") { await this.db.notes.filter(note => noteLinkIds(note).includes(link.id)).delete(); await this.db.events.where("linkId").equals(link.id).delete() }
        else { await this.db.notes.filter(note => noteLinkIds(note).includes(link.id)).modify(item => { if (item.linkId === link.id) delete item.linkId; if (item.mentions) item.mentions = item.mentions.filter(mention => mention.linkId !== link.id); item.revision++ }); await this.db.events.where("linkId").equals(link.id).modify(item => { delete item.linkId; item.revision++ }) }
        await this.db.applicationLinks.delete(link.id)
      }
      await this.db.applications.delete(id)
      if (linked === "delete") await this.pruneNoteBoard()
    })
  }
  async clear() { await this.db.transaction("rw", [this.db.applications, this.db.applicationLinks, this.db.notes, this.db.events, this.db.noteBoards], async () => { await this.db.applications.clear(); await this.db.applicationLinks.clear(); await this.db.notes.clear(); await this.db.events.clear(); await this.db.noteBoards.clear() }) }
  async backup() { return this.db.transaction("r", [this.db.applications, this.db.applicationLinks, this.db.notes, this.db.events, this.db.noteBoards], async () => ({ format: "todaystart" as const, version: 2 as const, exportedAt: new Date().toISOString(), records: await this.list(), ...(await this.plannerSnapshot()) })) }
  async restore(input: unknown) {
    const backup = BackupSchema.parse(input)
    if (backup.version === 2) {
      for (const values of [backup.links, backup.notes, backup.events]) if (new Set(values.map(value => value.id)).size !== values.length) throw new Error("백업에 중복 식별자가 있습니다.")
      const records = new Set(backup.records.map(record => record.id)), links = new Set(backup.links.map(link => link.id))
      const noteIds = new Set(backup.notes.map(note => note.id))
      if (backup.board && [...backup.board.order, ...Object.keys(backup.board.sizes)].some(id => !noteIds.has(id))) throw new Error("백업의 메모 배치를 확인해 주세요.")
      if (new Set(backup.links.map(link => link.recordId)).size !== backup.links.length || backup.links.some(link => !records.has(link.recordId)) || [...backup.notes, ...backup.events].some(item => item.linkId && !links.has(item.linkId))) throw new Error("백업의 메모·일정 연결을 확인해 주세요.")
      if (backup.notes.some(note => noteLinkIds(note).some(id => !links.has(id)) || validMentions(note.body, note.mentions).length !== (note.mentions || []).length)) throw new Error("백업의 기업 언급을 확인해 주세요.")
    }
    return this.db.transaction("rw", [this.db.applications, this.db.applicationLinks, this.db.notes, this.db.events, this.db.noteBoards], async () => {
    const records: ApplicationRecord[] = [], restoredIds = new Map<string, string>()
    for (const record of backup.records) {
      const alias = await this.db.applicationLinks.where("aliases").equals(record.id).first()
      const existing = await this.db.applications.get(record.id) || (alias ? await this.db.applications.get(alias.recordId) : undefined)
      // Preserve identity for an existing, manually edited local record. Unrelated IDs cannot overwrite it.
      const sameSource = existing && existing.platform === record.platform && (
        (record.sourceApplicationId && record.sourceApplicationId === existing.sourceApplicationId) ||
        (record.sourceJobId && record.sourceJobId === existing.sourceJobId && record.appliedAt === existing.appliedAt) ||
        (alias?.recordId === existing.id && !record.sourceApplicationId && !existing.sourceApplicationId && record.sourceJobId === existing.sourceJobId && record.appliedAt === existing.appliedAt && normalizeCompanyName(record.companyName) === existing.normalizedCompanyName && record.jobTitle === existing.jobTitle && record.sourceCreatedAt === existing.sourceCreatedAt))
      const restored = { ...record, id: sameSource ? existing!.id : applicationIdentity(record) }
      records.push(restored); restoredIds.set(record.id, restored.id)
    }
    const result = await this.merge(records)
    for (const [originalId, restoredId] of restoredIds) {
      const local = await this.db.applicationLinks.where("recordId").equals(restoredId).first() || await this.db.applicationLinks.where("aliases").equals(restoredId).first()
      if (local) { restoredIds.set(originalId, local.recordId); await this.db.applicationLinks.put({ ...local, aliases: [...new Set([...local.aliases, originalId])].slice(-200) }) }
    }
    if (backup.version === 2) {
      const linkIds = new Map<string, string>()
      for (const incoming of backup.links) {
        const recordId = restoredIds.get(incoming.recordId)!
        // Merge may promote an application ID. Its alias still resolves to the
        // same stable link, including when restoring into an existing database.
        const local = await this.db.applicationLinks.where("recordId").equals(recordId).first() || await this.db.applicationLinks.where("aliases").equals(recordId).first()
        if (!local) throw new Error("복원한 지원 기록의 연결을 찾지 못했습니다.")
        linkIds.set(incoming.id, local.id)
      }
      for (const note of backup.notes) {
        const current = await this.db.notes.get(note.id)
        if (!current || note.updatedAt > current.updatedAt) await this.db.notes.put({ ...note, linkId: note.linkId ? linkIds.get(note.linkId) : undefined, mentions: note.mentions?.map(mention => ({ ...mention, linkId: linkIds.get(mention.linkId)! })), revision: (current?.revision || 0) + 1 })
      }
      for (const event of backup.events) {
        const current = await this.db.events.get(event.id)
        if (!current || event.updatedAt > current.updatedAt) await this.db.events.put({ ...event, linkId: event.linkId ? linkIds.get(event.linkId) : undefined, revision: (current?.revision || 0) + 1 })
      }
    }
    if (backup.version === 2 && backup.board) {
      const local = (await this.db.noteBoards.get("main"))?.state
      if (!local || backup.board.updatedAt > local.updatedAt) await this.db.noteBoards.put({ id: "main", state: { ...backup.board, revision: (local?.revision || 0) + 1 } })
    }
    return { ...result, notes: backup.version === 2 ? backup.notes.length : 0, events: backup.version === 2 ? backup.events.length : 0 }
    })
  }
}
