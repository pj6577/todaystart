import { useState } from "react"
import type { Snapshot } from "../messaging/contracts"
import type { Note, NoteDraft, CareerEvent, EventDraft } from "../core/planner"
import { linkedRecord } from "../core/planner-lookups"
import { readPlannerDrafts, type PlannerDraft } from "./planner-drafts"

export function usePlannerEditors(snapshot: Snapshot | undefined, openNotes: () => void) {
  const [detail, setDetail] = useState<string>()
  const [noteEditor, setNoteEditor] = useState<{ initial: NoteDraft; recovered?: PlannerDraft; returnLinkId?: string; initialMenu?: boolean; activeId?: string }>()
  const [eventEditor, setEventEditor] = useState<{ initial: EventDraft; recovered?: PlannerDraft; returnLinkId?: string }>()
  const records = snapshot?.records || []
  const planner = snapshot?.planner || { links: [], notes: [], events: [] }
  function openNote(note?: Note, linkId?: string, returnLinkId?: string, initialMenu = false) {
    const initial: NoteDraft = note ? { id: note.id, expectedRevision: note.revision, title: note.title, body: note.body, checklist: note.checklist, pinned: note.pinned, linkId: note.linkId, color: note.color, mentions: note.mentions } : { id: crypto.randomUUID(), expectedRevision: 0, title: "", body: "", checklist: [], pinned: false, linkId, color: "yellow", mentions: [] }
    const recovered = readPlannerDrafts(snapshot?.dataGeneration).find((item): item is Extract<PlannerDraft, { kind: "note" }> => item.kind === "note" && (note ? item.value.id === note.id : item.value.expectedRevision === 0 && item.value.id !== noteEditor?.initial.id && item.value.linkId === linkId))
    setDetail(undefined); openNotes(); setNoteEditor({ initial: recovered?.value || initial, recovered, returnLinkId, initialMenu })
  }
  function openEvent(event?: CareerEvent, date?: string, linkId?: string, returnLinkId?: string) {
    const record = linkedRecord(linkId, records, planner.links)
    const initial: EventDraft = event ? { id: event.id, expectedRevision: event.revision, title: event.title, kind: event.kind, status: event.status, date: event.date, time: event.time, location: event.location, url: event.url, body: event.body, checklist: event.checklist, linkId: event.linkId } : { id: crypto.randomUUID(), expectedRevision: 0, title: record ? `${record.companyName} 면접` : "", kind: record ? "interview" : "other", status: "planned", date: date || new Date(Date.now() + 9 * 3600000).toISOString().slice(0,10), location: "", body: "", checklist: [], linkId }
    const recovered = readPlannerDrafts(snapshot?.dataGeneration).find((item): item is Extract<PlannerDraft, { kind: "event" }> => item.kind === "event" && (event ? item.value.id === event.id : item.value.expectedRevision === 0 && item.value.linkId === linkId && (!date || item.value.date === date)))
    setDetail(undefined); setEventEditor({ initial: recovered?.value || initial, recovered, returnLinkId })
  }
  function resumeDraft(draft: PlannerDraft) {
    setDetail(undefined)
    if (draft.kind === "note") { openNotes(); setNoteEditor({ initial: draft.value, recovered: draft }) }
    else setEventEditor({ initial: draft.value, recovered: draft })
  }

  function resetEditors() { setDetail(undefined); setNoteEditor(undefined); setEventEditor(undefined) }
  return { detail, setDetail, noteEditor, setNoteEditor, eventEditor, setEventEditor, openNote, openEvent, resumeDraft, resetEditors }
}
