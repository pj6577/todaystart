import { z } from "zod"
import { EventDraftSchema, NoteDraftSchema, type EventDraft, type NoteDraft } from "../core/planner"

const prefix = "todaystart:planner-draft:"
const generationKey = "todaystart:planner-generation"
export const draftsChanged = "todaystart:planner-drafts-changed"
// Incomplete forms are recoverable drafts, never real calendar events.
const metadata = { key: z.string(), generation: z.string().optional(), updatedAt: z.number() }
const DraftSchema = z.discriminatedUnion("kind", [
  z.object({ ...metadata, kind: z.literal("note"), value: NoteDraftSchema.extend({ title: z.string().max(200) }) }),
  z.object({ ...metadata, kind: z.literal("event"), value: EventDraftSchema.extend({ title: z.string().max(200), date: z.string().max(10), time: z.string().max(5).optional(), url: z.string().max(3000).optional() }) })
])
export type PlannerDraft = z.infer<typeof DraftSchema>
function changed() { window.dispatchEvent(new Event(draftsChanged)) }
export function syncDraftGeneration(generation?: string) {
  const next = generation || "initial"
  if (localStorage.getItem(generationKey) === next) return
  localStorage.setItem(generationKey, next)
  for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) {
    try { if (JSON.parse(localStorage.getItem(key)!).generation !== generation) localStorage.removeItem(key) } catch { localStorage.removeItem(key) }
  }
  changed()
}
export function readPlannerDrafts(generation?: string): PlannerDraft[] {
  return Object.keys(localStorage).filter(key => key.startsWith(prefix)).flatMap(key => {
    try {
      const result = DraftSchema.safeParse(JSON.parse(localStorage.getItem(key)!))
      return result.success && result.data.generation === generation ? [{ ...result.data, key }] : []
    } catch { return [] }
  }).sort((a, b) => b.updatedAt - a.updatedAt)
}
export function removePlannerDraft(draft: PlannerDraft) {
  const current = localStorage.getItem(draft.key)
  // Another window may have changed the same recovery copy in the meantime.
  if (current && JSON.parse(current).updatedAt === draft.updatedAt) localStorage.removeItem(draft.key)
  changed()
}
export function createDraftSession(kind: "note" | "event", generation?: string, recovered?: PlannerDraft) {
  const key = prefix + crypto.randomUUID()
  return {
    write(value: NoteDraft | EventDraft) {
      if (localStorage.getItem(generationKey) !== (generation || "initial")) throw new Error("데이터가 초기화되어 이전 작성 내용을 저장할 수 없어요.")
      localStorage.setItem(key, JSON.stringify({ key, kind, generation, value, updatedAt: Date.now() }))
      if (recovered) removePlannerDraft(recovered)
      changed()
    },
    clear() { localStorage.removeItem(key); if (recovered) removePlannerDraft(recovered); changed() }
  }
}
