import { z } from "zod"
import type { Note } from "./planner"

export const defaultNoteSize = { width: 320, height: 360 }
export const NoteSizeSchema = z.object({ width: z.number().int().min(260).max(720), height: z.number().int().min(260).max(900) }).strict()
export const NoteBoardSchema = z.object({ order: z.array(z.string().uuid()).max(10000), sizes: z.record(z.string().uuid(), NoteSizeSchema), revision: z.number().int().min(0), updatedAt: z.string().datetime() }).strict().refine(value => new Set(value.order).size === value.order.length && Object.keys(value.sizes).length <= 10000)
export type NoteBoard = z.infer<typeof NoteBoardSchema>
export type NoteSize = z.infer<typeof NoteSizeSchema>
export const NoteLayoutChangeSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("move"), id: z.string().uuid(), beforeId: z.string().uuid().optional() }).strict(), z.object({ kind: z.literal("resize"), id: z.string().uuid(), size: NoteSizeSchema }).strict()])
export type NoteLayoutChange = z.infer<typeof NoteLayoutChangeSchema>
export function emptyNoteBoard(): NoteBoard { return { order: [], sizes: {}, revision: 0, updatedAt: "1970-01-01T00:00:00.000Z" } }
export function orderedNoteIds(notes: Pick<Note, "id" | "pinned" | "updatedAt">[], board?: NoteBoard) {
  const ids = new Set(notes.map(note => note.id)), saved = (board?.order || []).filter(id => ids.has(id))
  const known = new Set(saved)
  const added = notes.filter(note => !known.has(note.id)).sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).map(note => note.id)
  return [...added, ...saved]
}
export function moveNote(order: string[], id: string, beforeId?: string) {
  if (id === beforeId || !order.includes(id)) return order
  const next = order.filter(value => value !== id), index = beforeId ? next.indexOf(beforeId) : next.length
  if (index < 0) return order
  next.splice(index, 0, id); return next
}
export function clampNoteSize(width: number, height: number): NoteSize { return { width: Math.round(Math.max(260, Math.min(720, width))), height: Math.round(Math.max(260, Math.min(900, height))) } }
