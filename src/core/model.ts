import { z } from "zod"
import { platformIds, platformDefinitions } from "./platforms"

export const PlatformSchema = z.enum(platformIds)
export type Platform = z.infer<typeof PlatformSchema>
export const ApplicationSourceSchema = z.enum([...platformIds, "manual"])
export type ApplicationSource = z.infer<typeof ApplicationSourceSchema>
export const applicationSources = [...platformIds, "manual"] as const
export const platformLabel: Record<ApplicationSource, string> = { ...Object.fromEntries(platformIds.map(id => [id, platformDefinitions[id].label])) as Record<Platform, string>, manual: "직접 지원" }
export const StatusSchema = z.enum(["applied", "pending_confirmation", "cancelled", "unknown"])
export type ApplicationStatus = z.infer<typeof StatusSchema>
export const statusLabel: Record<ApplicationStatus, string> = {
  applied: "지원 완료", pending_confirmation: "확인 대기", cancelled: "지원 취소", unknown: "상태 불명"
}
export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T00:00:00Z")
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
})
export const ApplicationSchema = z.object({
  id: z.string().min(1).max(4096),
  platform: ApplicationSourceSchema,
  sourceLabel: z.string().trim().min(1).max(80).optional(),
  sourceApplicationId: z.string().min(1).max(200).optional(),
  sourceJobId: z.string().min(1).max(200).optional(),
  internalGiNo: z.string().regex(/^\d{1,20}$/).optional(),
  companyName: z.string().trim().min(1).max(300),
  normalizedCompanyName: z.string().min(1).max(300),
  companyIdentifier: z.string().max(200).optional(),
  jobTitle: z.string().trim().min(1).max(1000),
  jobUrl: z.string().url().optional(),
  appliedAt: DateSchema.optional(),
  appliedAtTime: z.string().datetime({ offset: true }).optional(),
  sourceCreatedAt: z.string().min(10).max(64).optional(),
  sourceStatus: z.string().trim().min(1).max(80).optional(),
  readStatus: z.enum(["read", "unread", "unknown"]).optional(),
  submissionAttemptId: z.string().uuid().optional(),
  submissionStage: z.enum(["started", "submitting", "confirmed", "unverified"]).optional(),
  status: StatusSchema,
  evidence: z.enum(["history_page", "success_page", "submission_attempt", "submission_result", "manual"]),
  collectedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  lastSyncedAt: z.string().datetime()
}).strict()
export type ApplicationRecord = z.infer<typeof ApplicationSchema>
export const requiresStatusReview = (record: Pick<ApplicationRecord, "status" | "submissionStage">) => record.status === "unknown" || record.status === "pending_confirmation" && record.submissionStage === "unverified"
export const readStatusLabel = { read: "열람", unread: "미열람", unknown: "미확인" } as const
export function isRejectedApplication(record: Pick<ApplicationRecord, "status" | "sourceStatus">) {
  if (record.status !== "applied") return false
  const label = record.sourceStatus?.normalize("NFKC").replace(/\s+/g, "").toLowerCase() || ""
  return /^(?:reject(?:ed)?|(?:(?:서류|면접|최종)?전형|서류|면접|최종)?불합격(?:\((?:서류|면접|최종)(?:전형)?\))?)$/.test(label)
}
export function recordReadStatus(record: Pick<ApplicationRecord, "status" | "sourceStatus" | "readStatus">): NonNullable<ApplicationRecord["readStatus"]> {
  return isRejectedApplication(record) ? "read" : record.readStatus || "unknown"
}
export const ManualApplicationSchema = z.object({
  platform: ApplicationSourceSchema.default("manual"),
  sourceLabel: z.string().trim().min(1).max(80).optional(),
  companyName: z.string().trim().min(1).max(300), jobTitle: z.string().trim().min(1).max(1000),
  appliedAt: DateSchema, status: StatusSchema,
  jobUrl: z.string().trim().max(3000).optional()
}).strict()
export type ManualApplication = z.infer<typeof ManualApplicationSchema>
export function sourceLabel(record: Pick<ApplicationRecord, "platform" | "sourceLabel">): string {
  return record.platform === "manual" ? record.sourceLabel || platformLabel.manual : platformLabel[record.platform]
}
export const recordDateLabel = (record: Pick<ApplicationRecord, "appliedAt" | "sourceCreatedAt">) => record.appliedAt ? record.appliedAt.replaceAll("-", ".") : record.sourceCreatedAt ? record.sourceCreatedAt.slice(0, 10).replaceAll("-", ".") : "날짜 미확인"
export const recordStatusLabel = (record: Pick<ApplicationRecord, "status" | "sourceStatus" | "submissionStage">) => record.status === "applied" ? record.sourceStatus || statusLabel.applied : record.status === "pending_confirmation" && record.submissionStage ? ({ started: "지원 시작", submitting: "제출 확인 중", confirmed: "확인 대기", unverified: "확인 필요" } as const)[record.submissionStage] : statusLabel[record.status]
export interface JobPosting {
  platform: Platform
  companyName: string
  companyIdentifier?: string
  jobTitle: string
  jobUrl?: string
  sourceJobId?: string
  element?: Element
}
export type Confidence = "exact" | "probable" | "possible" | "none"
export interface CompanyMatch { record: ApplicationRecord; confidence: Exclude<Confidence, "none">; reason: string }
export type DiagnosticCode = "ok" | "empty" | "login_required" | "selectors_unverified" | "dom_changed" | "loading" | "partial" | "error"
export interface CollectionResult {
  records: ApplicationRecord[]
  code: DiagnosticCode
  message: string
  skipped: number
  hasNextPage: boolean
  scope: string
}
export interface SyncReport extends Omit<CollectionResult, "records"> {
  platform: Platform
  inserted: number
  updated: number
  collected: number
  at: string
}
export interface PageState {
  platform?: Platform
  kind: "history" | "listing" | "detail" | "other"
  matches: number
  message: string
  hasNextPage?: boolean
  profileReady?: boolean
  collectionCode?: DiagnosticCode
  lastReport?: SyncReport
}
