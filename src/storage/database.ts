import Dexie, { type Table } from "dexie"
import type { ApplicationRecord } from "../core/model"
import type { ApplicationLink, Note, CareerEvent } from "../core/planner"
import type { NoteBoard } from "../core/note-board"

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
