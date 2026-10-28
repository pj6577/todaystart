import type { ApplicationRecord, Platform, SyncReport } from "../core/model"
import type { PlannerSnapshot } from "../core/planner"
import type { Settings } from "../storage/settings"
import type { HistoryRun } from "../collection/history-run-model"
import type { HistoryCompletions } from "../storage/history-completions"
import type { SubmissionAttempt } from "../submission/model"
import type { ApplicationRepository } from "../storage/repository"
import type { Request } from "./protocol"

// Optional fields are included only for authorized extension UI callers.
export interface Snapshot {
  records: ApplicationRecord[]
  settings: Settings
  reports: Partial<Record<Platform, SyncReport>>
  historyRun?: HistoryRun
  historyCompletions?: HistoryCompletions
  submissionAttempts?: SubmissionAttempt[]
  dataGeneration?: string
  planner?: PlannerSnapshot
}

type StoredResult<K extends keyof ApplicationRepository> = ApplicationRepository[K] extends (...args: never[]) => infer Result ? Awaited<Result> : never

export interface ResponseMap {
  snapshot: Snapshot
  planner_snapshot: { planner: PlannerSnapshot; dataGeneration?: string }
  submission_policy: { enabled: boolean }
  submission: boolean
  open_dashboard: chrome.tabs.Tab
  history_run: HistoryRun | boolean
  settings: Settings
  manual_create: StoredResult<"createManual">
  collect: SyncReport
  observe: StoredResult<"merge">
  edit: StoredResult<"edit">
  remove: boolean
  note_save: StoredResult<"saveNote">
  note_layout: StoredResult<"changeNoteLayout">
  event_save: StoredResult<"saveEvent">
  event_kinds_save: StoredResult<"saveEventKinds">
  planner_remove: void
  reset_data: boolean
  backup: StoredResult<"backup">
  restore: StoredResult<"restore">
}

export type Response<R extends Request> = ResponseMap[R["type"]]
