import type { ApplicationRecord } from "./model"
import type { ApplicationLink, Note } from "./planner"
import { noteLinkIds } from "./note-mentions"

export function linkedRecord(linkId: string | undefined, records: ApplicationRecord[], links: ApplicationLink[]) {
  if (!linkId) return undefined
  const recordId = links.find(link => link.id === linkId)?.recordId
  return recordId ? records.find(record => record.id === recordId) : undefined
}

export function linkedRecordMap(records: ApplicationRecord[], links: ApplicationLink[]) {
  const byId = new Map(records.map(record => [record.id, record]))
  return new Map(links.flatMap(link => {
    const record = byId.get(link.recordId)
    return record ? [[link.id, record] as const] : []
  }))
}

export function noteCountsByRecord(links: ApplicationLink[], notes: Note[]) {
  const byLink = new Map<string, number>()
  for (const note of notes) for (const id of noteLinkIds(note)) byLink.set(id, (byLink.get(id) || 0) + 1)
  return Object.fromEntries(links.map(link => [link.recordId, byLink.get(link.id) || 0]))
}
