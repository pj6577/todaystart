import type { TodayStartDatabase } from "./database"
import type { ApplicationRecord } from "../core/model"
import type { PlannerSnapshot } from "../core/planner"
import { normalizeCompanyName } from "../core/company"
import { applicationIdentity } from "../core/identity"
import { noteLinkIds, validMentions } from "../core/note-mentions"
import { BackupSchema } from "./backup-schema"
import { mergeEventKindConfigs } from "../core/event-kinds"

interface ApplicationStore {
  list(): Promise<ApplicationRecord[]>
  merge(records: unknown[]): Promise<{ inserted: number; updated: number }>
  plannerSnapshot(): Promise<PlannerSnapshot>
}

// Restore and its nested merges share the caller's Dexie transaction.
export class BackupRepository {
  constructor(private readonly db: TodayStartDatabase, private readonly applications: ApplicationStore) {}
  async backup() { return this.db.transaction("r", [this.db.applications, this.db.applicationLinks, this.db.notes, this.db.events, this.db.noteBoards, this.db.eventKindConfigs], async () => ({ format: "todaystart" as const, version: 2 as const, exportedAt: new Date().toISOString(), records: await this.applications.list(), ...(await this.applications.plannerSnapshot()) })) }
  async restore(input: unknown) {
    const backup = BackupSchema.parse(input)
    if (backup.version === 2) {
      for (const values of [backup.links, backup.notes, backup.events]) if (new Set(values.map(value => value.id)).size !== values.length) throw new Error("백업에 중복 식별자가 있습니다.")
      const records = new Set(backup.records.map(record => record.id)), links = new Set(backup.links.map(link => link.id))
      const noteIds = new Set(backup.notes.map(note => note.id))
      if (backup.board && [...backup.board.order, ...Object.keys(backup.board.sizes)].some(id => !noteIds.has(id))) throw new Error("백업의 메모 배치를 확인해 주세요.")
      if (new Set(backup.links.map(link => link.recordId)).size !== backup.links.length || backup.links.some(link => !records.has(link.recordId)) || [...backup.notes, ...backup.events].some(item => item.linkId && !links.has(item.linkId))) throw new Error("백업의 메모·일정 연결을 확인해 주세요.")
      if (backup.notes.some(note => noteLinkIds(note).some(id => !links.has(id)) || validMentions(note.body, note.mentions).length !== (note.mentions || []).length)) throw new Error("백업의 기업 언급을 확인해 주세요.")
      if (backup.events.some(event => event.kind.startsWith("custom:") && !backup.eventKindConfig?.kinds.some(kind => kind.id === event.kind))) throw new Error("백업의 사용자 일정 종류를 확인해 주세요.")
    }
    return this.db.transaction("rw", [this.db.applications, this.db.applicationLinks, this.db.notes, this.db.events, this.db.noteBoards, this.db.eventKindConfigs], async () => {
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
    const result = await this.applications.merge(records)
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
    const config = mergeEventKindConfigs((await this.db.eventKindConfigs.get("main"))?.state, backup.version === 2 ? backup.eventKindConfig : undefined, await this.db.events.toArray())
    if (config) await this.db.eventKindConfigs.put({ id: "main", state: config })
    return { ...result, notes: backup.version === 2 ? backup.notes.length : 0, events: backup.version === 2 ? backup.events.length : 0 }
    })
  }
}
