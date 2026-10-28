import { z } from "zod"
import { DateSchema } from "./model"
import type { NoteBoard } from "./note-board"
import { EventKindSchema, type EventKindConfig } from "./event-kinds"
export { eventKinds, EventKindSchema } from "./event-kinds"

export const eventStatuses = { planned: "예정", completed: "완료", cancelled: "취소" } as const
export const preparationStates = { not_started: "준비 전", in_progress: "준비 중", ready: "준비 완료" } as const
export const PreparationStateSchema = z.enum(["not_started", "in_progress", "ready"])
export type PreparationState = z.infer<typeof PreparationStateSchema>
const LinkIdSchema = z.string().uuid()
export const ApplicationLinkSchema = z.object({ id: LinkIdSchema, recordId: z.string().min(1).max(4096), aliases: z.array(z.string().min(1).max(4096)).max(200) }).strict()
export type ApplicationLink = z.infer<typeof ApplicationLinkSchema>
export const ChecklistSchema = z.array(z.object({ id: z.string().uuid(), text: z.string().trim().min(1).max(500), done: z.boolean() }).strict()).max(100)
const versioned = { id: z.string().uuid(), revision: z.number().int().positive(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), linkId: LinkIdSchema.optional() }
export const noteColors = { yellow: "페이퍼", cream: "아이보리", sage: "스톤", lavender: "쿨 그레이", rose: "웜 그레이" } as const
export const NoteMentionSchema = z.object({ linkId: LinkIdSchema, label: z.string().min(1).max(300), start: z.number().int().min(0).max(50000), end: z.number().int().positive().max(50000) }).strict()
export type NoteMention = z.infer<typeof NoteMentionSchema>
export const NoteFieldsSchema = z.object({ title: z.string().trim().min(1).max(200), body: z.string().max(50000), pinned: z.boolean(), checklist: ChecklistSchema, color: z.enum(["yellow", "cream", "sage", "lavender", "rose"]).optional(), mentions: z.array(NoteMentionSchema).max(100).optional() }).strict()
export const NoteSchema = NoteFieldsSchema.extend(versioned).strict()
export type Note = z.infer<typeof NoteSchema>
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
export const EventFieldsSchema = z.object({ title: z.string().trim().min(1).max(200), kind: EventKindSchema, date: DateSchema, time: time.optional(), status: z.enum(["planned", "completed", "cancelled"]), preparation: PreparationStateSchema.optional(), location: z.string().max(1000), url: z.string().url().max(3000).refine(value => { try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password } catch { return false } }, "접속 링크는 HTTPS 주소를 입력해 주세요.").optional(), body: z.string().max(10000), checklist: ChecklistSchema }).strict()
export const CareerEventSchema = EventFieldsSchema.extend(versioned).strict()
export type CareerEvent = z.infer<typeof CareerEventSchema>
const edit = { id: z.string().uuid(), expectedRevision: z.number().int().min(0), linkId: LinkIdSchema.optional() }
export const NoteDraftSchema = NoteFieldsSchema.extend(edit).strict()
export const EventDraftSchema = EventFieldsSchema.extend(edit).strict()
export type NoteDraft = z.infer<typeof NoteDraftSchema>
export type EventDraft = z.infer<typeof EventDraftSchema>
export interface PlannerSnapshot { links: ApplicationLink[]; notes: Note[]; events: CareerEvent[]; board?: NoteBoard; eventKindConfig?: EventKindConfig }

export function eventToDraft(event: CareerEvent): EventDraft {
  const { revision, createdAt, updatedAt, ...fields } = event
  return { ...fields, expectedRevision: revision }
}

export function shiftEventDate(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

export function calendarWeek(date: string) {
  const offset = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
  return Array.from({ length: 7 }, (_, day) => shiftEventDate(date, day - offset))
}

export function calendarCells(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`)
  const offset = (first.getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => { const d = new Date(first); d.setUTCDate(1 - offset + index); return d.toISOString().slice(0, 10) })
}
export function compareEvents(a: CareerEvent, b: CareerEvent) { return a.date.localeCompare(b.date) || (a.time || "24:00").localeCompare(b.time || "24:00") || a.title.localeCompare(b.title, "ko") || a.id.localeCompare(b.id) }
export function upcomingEvents(events: CareerEvent[], today: string, nowTime: string) {
  return events.filter(event => event.status === "planned" && (event.date > today || event.date === today && (!event.time || event.time >= nowTime))).sort(compareEvents)
}
export function dateDistanceLabel(date: string, today: string) {
  const distance = Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000)
  return distance === 0 ? "오늘" : distance === 1 ? "내일" : distance > 0 ? `D-${distance}` : `${-distance}일 전`
}
export const noteTemplates = {
  research: { label: "기업 조사", title: "기업 조사", body: "기업과 제품\n\n이 직무를 선택한 이유\n\n채용 공고에서 확인할 점\n\n참고 링크\n", tasks: ["제품·서비스 살펴보기", "채용 공고 다시 읽기"] },
  preparation: { label: "면접 준비", title: "면접 준비", body: "예상 질문\n\n강조할 프로젝트 경험\n\n면접관에게 물어볼 질문\n", tasks: ["자기소개 연습", "접속 링크·장소 확인"] },
  reflection: { label: "면접 복기", title: "면접 복기", body: "받은 질문과 답변\n\n잘 전달한 내용\n\n아쉬웠던 답변\n\n다음에 보완할 점\n", tasks: [] }
} as const
