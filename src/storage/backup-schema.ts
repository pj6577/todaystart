import { z } from "zod"
import { ApplicationSchema } from "../core/model"
import { ApplicationLinkSchema, CareerEventSchema, NoteSchema } from "../core/planner"
import { NoteBoardSchema } from "../core/note-board"

const backupBase = { format: z.literal("todaystart"), exportedAt: z.string().datetime(), records: z.array(ApplicationSchema).max(50000) }
export const BackupSchema = z.discriminatedUnion("version", [z.object({ ...backupBase, version: z.literal(1) }).strict(), z.object({ ...backupBase, version: z.literal(2), links: z.array(ApplicationLinkSchema).max(50000), notes: z.array(NoteSchema).max(10000), events: z.array(CareerEventSchema).max(10000), board: NoteBoardSchema.optional() }).strict()])
