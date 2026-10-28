import { z } from "zod"
import { ApplicationSchema, PlatformSchema, ManualApplicationSchema } from "../core/model"
import { SettingsSchema } from "../storage/settings"
import { SubmissionEventSchema } from "../submission/model"
import { NoteDraftSchema, EventDraftSchema } from "../core/planner"
import { NoteLayoutChangeSchema } from "../core/note-board"
import { EventKindChangeSchema } from "../core/event-kinds"
import type { Response } from "./contracts"

export const CollectionSchema = z.object({
  records: z.array(ApplicationSchema).max(2000),
  code: z.enum(["ok", "empty", "login_required", "selectors_unverified", "dom_changed", "loading", "partial", "error"]),
  message: z.string().max(2000), skipped: z.number().int().min(0), hasNextPage: z.boolean(), scope: z.string().max(2000)
}).strict()
export const RequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot") }).strict(),
  z.object({ type: z.literal("planner_snapshot") }).strict(),
  z.object({ type: z.literal("submission_policy") }).strict(),
  z.object({ type: z.literal("open_dashboard") }).strict(),
  z.object({ type: z.literal("settings"), settings: SettingsSchema }).strict(),
  z.object({ type: z.literal("manual_create"), application: ManualApplicationSchema, submissionAttemptId: z.string().uuid().optional(), dataGeneration: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("history_run"), operation: z.enum(["start", "stop", "retry"]), tabId: z.number().int().positive().optional() }).strict(),
  z.object({ type: z.literal("collect"), platform: PlatformSchema, result: CollectionSchema, automatic: z.boolean(), dataGeneration: z.string().uuid().optional(), runId: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("observe"), record: ApplicationSchema }).strict(),
  z.object({ type: z.literal("submission"), event: SubmissionEventSchema }).strict(),
  z.object({ type: z.literal("edit"), id: z.string(), changes: ApplicationSchema.pick({ companyName: true, jobTitle: true, appliedAt: true, status: true }) }).strict(),
  z.object({ type: z.literal("remove"), id: z.string(), linked: z.enum(["keep", "delete"]).optional() }).strict(),
  z.object({ type: z.literal("note_save"), note: NoteDraftSchema, dataGeneration: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("note_layout"), change: NoteLayoutChangeSchema, dataGeneration: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("event_save"), event: EventDraftSchema, dataGeneration: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("event_kinds_save"), change: EventKindChangeSchema, dataGeneration: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("planner_remove"), kind: z.enum(["note", "event"]), id: z.string().uuid(), revision: z.number().int().positive(), dataGeneration: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("reset_data") }).strict(),
  z.object({ type: z.literal("backup") }).strict(),
  z.object({ type: z.literal("restore"), backup: z.unknown() }).strict()
])
export type Request = z.infer<typeof RequestSchema>
export type Envelope<T> = { ok: true; data: T } | { ok: false; error: string }

export function requestErrorMessage(message: string): string {
  try {
    const issues: unknown = JSON.parse(message)
    if (Array.isArray(issues) && issues.some(issue => issue?.code === "invalid_union_discriminator" && Array.isArray(issue.path) && issue.path.length === 1 && issue.path[0] === "type" || issue?.code === "unrecognized_keys" && issue.path?.length === 1 && (issue.path[0] === "note" && issue.keys?.some((key: string) => key === "mentions" || key === "color") || issue.path[0] === "event" && issue.keys?.includes("preparation")))) {
      return "이전 버전의 백그라운드가 실행 중이에요. chrome://extensions에서 오늘시작의 새로고침 버튼을 누른 뒤 이 화면도 새로고침해 주세요."
    }
  } catch { /* Normal application errors already contain a readable message. */ }
  return message
}

export async function rpc<R extends Request>(request: R): Promise<Response<R>> {
  const result: Envelope<Response<R>> | undefined = await chrome.runtime.sendMessage(request)
  if (!result) throw new Error("확장 프로그램에 연결하지 못했습니다. 확장 프로그램을 새로고침해 주세요.")
  if (!result.ok) throw new Error(requestErrorMessage(result.error))
  return result.data
}
