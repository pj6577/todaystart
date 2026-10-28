import { ApplicationSchema, ManualApplicationSchema, type ApplicationRecord } from "../core/model"
import { normalizeCompanyName } from "../core/company"
import { applicationIdentity, mergedRecord } from "../core/identity"
import { jobIdFromUrl, safeJobUrl } from "../core/urls"
import { noteLinkIds } from "../core/note-mentions"
import { TodayStartDatabase } from "./database"
import { PlannerRepository } from "./planner-repository"
import { BackupRepository } from "./backup-repository"

export { TodayStartDatabase } from "./database"
export { BackupSchema } from "./backup-schema"

export class ApplicationRepository {
  private readonly planner: PlannerRepository
  private readonly backups: BackupRepository
  constructor(readonly db = new TodayStartDatabase()) {
    this.planner = new PlannerRepository(db)
    this.backups = new BackupRepository(db, this)
  }
  list() { return this.db.applications.toArray() }
  async createManual(input: unknown, submission?: Pick<ApplicationRecord, "submissionAttemptId" | "submissionStage" | "sourceJobId" | "internalGiNo" | "sourceApplicationId">) {
    const draft = ManualApplicationSchema.parse(input)
    const jobUrl = draft.jobUrl ? safeJobUrl(draft.jobUrl, draft.platform) : undefined
    if (draft.jobUrl && !jobUrl) throw new Error("공고 주소는 로그인 정보가 없는 HTTPS 주소를 입력해 주세요. 기업 홈페이지 주소는 ‘직접 지원’을 선택해 주세요.")
    const now = new Date().toISOString()
    const record: Omit<ApplicationRecord, "id"> = { ...draft, ...submission, sourceLabel: draft.platform === "manual" ? draft.sourceLabel : undefined, jobUrl, sourceJobId: draft.platform === "manual" ? undefined : submission?.sourceJobId || jobIdFromUrl(jobUrl), normalizedCompanyName: normalizeCompanyName(draft.companyName), evidence: "manual" as const, collectedAt: now, lastSeenAt: now, lastSyncedAt: now }
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
  plannerSnapshot() { return this.planner.snapshot() }
  changeNoteLayout(input: unknown) { return this.planner.changeNoteLayout(input) }
  saveNote(input: unknown) { return this.planner.saveNote(input) }
  saveEvent(input: unknown) { return this.planner.saveEvent(input) }
  saveEventKinds(input: unknown) { return this.planner.saveEventKinds(input) }
  deletePlanner(kind: "note" | "event", id: string, revision: number) { return this.planner.deletePlanner(kind, id, revision) }
  async delete(id: string, linked: "keep" | "delete" = "keep") {
    await this.db.transaction("rw", [this.db.applications, this.db.applicationLinks, this.db.notes, this.db.events, this.db.noteBoards], async () => {
      const link = await this.db.applicationLinks.where("recordId").equals(id).first()
      if (link) {
        if (linked === "delete") { await this.db.notes.filter(note => noteLinkIds(note).includes(link.id)).delete(); await this.db.events.where("linkId").equals(link.id).delete() }
        else { await this.db.notes.filter(note => noteLinkIds(note).includes(link.id)).modify(item => { if (item.linkId === link.id) delete item.linkId; if (item.mentions) item.mentions = item.mentions.filter(mention => mention.linkId !== link.id); item.revision++ }); await this.db.events.where("linkId").equals(link.id).modify(item => { delete item.linkId; item.revision++ }) }
        await this.db.applicationLinks.delete(link.id)
      }
      await this.db.applications.delete(id)
      if (linked === "delete") await this.planner.pruneNoteBoard()
    })
  }
  async clear() { await this.db.transaction("rw", [this.db.applications, this.db.applicationLinks, this.db.notes, this.db.events, this.db.noteBoards, this.db.eventKindConfigs], async () => { await this.db.applications.clear(); await this.db.applicationLinks.clear(); await this.db.notes.clear(); await this.db.events.clear(); await this.db.noteBoards.clear(); await this.db.eventKindConfigs.clear() }) }
  backup() { return this.backups.backup() }
  restore(input: unknown) { return this.backups.restore(input) }
}
