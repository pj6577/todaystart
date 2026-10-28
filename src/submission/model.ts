import { z } from "zod"

export const SubmissionPlatformSchema = z.enum(["saramin", "jobkorea", "wanted"])
export const NumericIdSchema = z.string().regex(/^\d{1,20}$/)
export const SubmissionContextSchema = z.object({
  sourceJobId: NumericIdSchema, companyName: z.string().trim().min(1).max(300),
  internalGiNo: NumericIdSchema.optional(),
  jobTitle: z.string().trim().min(1).max(1000), jobUrl: z.string().url().max(2000)
}).strict()
export type SubmissionContext = z.infer<typeof SubmissionContextSchema>
const base = { platform: SubmissionPlatformSchema }
const request = { sourceJobId: NumericIdSchema, requestId: z.string().uuid() }
export const SubmissionEventSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("context"), context: SubmissionContextSchema }).strict(),
  z.object({ ...base, kind: z.literal("entered"), sourceJobId: NumericIdSchema }).strict(),
  z.object({ kind: z.literal("apply_clicked"), platform: z.enum(["jobkorea", "wanted"]), sourceJobId: NumericIdSchema }).strict(),
  z.object({ kind: z.literal("popup_link"), platform: z.literal("jobkorea"), sourceJobId: NumericIdSchema, internalGiNo: NumericIdSchema, launchId: z.string().uuid().optional() }).strict(),
  z.object({ ...base, ...request, kind: z.literal("submitting") }).strict(),
  z.object({ ...base, ...request, kind: z.literal("result"), outcome: z.enum(["success", "unverified"]), sourceApplicationId: NumericIdSchema.optional() }).strict(),
  z.object({ kind: z.literal("completed"), platform: z.literal("saramin"), sourceJobId: NumericIdSchema, sourceApplicationId: NumericIdSchema }).strict(),
  z.object({ kind: z.literal("wanted_completed"), platform: z.literal("wanted"), sourceJobId: NumericIdSchema }).strict(),
  z.object({ kind: z.literal("wanted_submit"), platform: z.literal("wanted"), context: SubmissionContextSchema }).strict(),
  z.object({ kind: z.literal("completion_marker"), platform: z.literal("jobkorea"), postingId: NumericIdSchema.optional() }).strict(),
  z.object({ ...base, kind: z.literal("landed") }).strict()
])
export type SubmissionEvent = z.infer<typeof SubmissionEventSchema>
export const SubmissionAttemptSchema = z.object({
  id: z.string().uuid(), platform: SubmissionPlatformSchema,
  tabId: z.number().int(), openerTabId: z.number().int().optional(), frameId: z.number().int(), documentId: z.string().optional(),
  sourceJobId: NumericIdSchema, context: SubmissionContextSchema.optional(),
  contextTabId: z.number().int().optional(),
  stage: z.enum(["started", "submitting", "confirmed", "unverified"]),
  requestId: z.string().uuid().optional(), sourceApplicationId: NumericIdSchema.optional(),
  clickedAt: z.string().datetime().optional(),
  closedAt: z.string().datetime().optional(),
  resultDocumentId: z.string().optional(),
  completionIssue: z.enum(["ambiguous_attempts", "missing_context", "posting_mismatch"]).optional(),
  confirmationMethod: z.enum(["api_response", "completion_page", "completion_marker", "history_page"]).optional(),
  startedAt: z.string().datetime(), updatedAt: z.string().datetime(),
  reason: z.enum(["opened", "waiting", "success", "result_unknown", "navigation", "closed", "timeout", "manual"]).default("opened")
}).strict()
export type SubmissionAttempt = z.infer<typeof SubmissionAttemptSchema>
export const submissionStageLabel = { started: "지원 시작", submitting: "제출 확인 중", confirmed: "지원 완료", unverified: "확인 필요" } as const
export const bridgeEventName = "todaystart:submission:v1"

export function applicationPage(raw: string): { platform: "saramin" | "jobkorea" | "wanted"; jobId?: string; postingId?: string; result: boolean } | undefined {
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:") return
    const wanted = url.hostname === "www.wanted.co.kr" && /^\/wd\/(\d{1,20})(\/applied)?\/?$/.exec(url.pathname)
    if (wanted) return { platform: "wanted", jobId: wanted[1], result: !!wanted[2] }
    const saramin = url.hostname === "www.saramin.co.kr" && /^\/zf_user\/member\/apply(?:\/complete)?\/?$/.test(url.pathname)
    const jobkorea = url.hostname === "www.jobkorea.co.kr" && /^\/recruit\/onpass(?:\/onpass(?:apply|result))?\/?$/i.test(url.pathname)
    if (!saramin && !jobkorea) return
    const numericParam = (name: string) => {
      const values = [...url.searchParams].filter(([key]) => saramin ? key === name : key.toLowerCase() === name.toLowerCase()).map(([, value]) => value)
      return values.length && new Set(values).size === 1 && NumericIdSchema.safeParse(values[0]).success ? values[0] : undefined
    }
    // OnPass giNo is an internal application-form ID; OnPassResult gNo is the
    // public GI_Read posting ID. Do not read resume/part/pass query parameters.
    const postingId = jobkorea && /\/onpassresult\/?$/i.test(url.pathname) ? numericParam("gNo") : undefined
    return { platform: saramin ? "saramin" : "jobkorea", jobId: numericParam(saramin ? "rec_idx" : "giNo"), ...(postingId ? { postingId } : {}), result: saramin ? /\/complete\/?$/.test(url.pathname) : /\/onpass(?:apply|result)\/?$/i.test(url.pathname) }
  } catch { return }
}

export function saraminCompletion(raw: string, visibleText?: string) {
  const page = applicationPage(raw)
  if (page?.platform !== "saramin" || !page.result || !page.jobId) return
  const sourceApplicationId = new URL(raw).searchParams.get("recruitapply_idx")
  if (!NumericIdSchema.safeParse(sourceApplicationId).success || !/(?:^|\s)입사지원\s*완료!(?:\s|$)/.test(visibleText || "")) return
  return { kind: "completed" as const, platform: "saramin" as const, sourceJobId: page.jobId, sourceApplicationId: sourceApplicationId! }
}

// Only the allowlisted success flag and numeric IDs cross the page-world bridge.
export function saraminResult(value: unknown, jobId: string): { outcome: "success" | "unverified"; sourceApplicationId?: string } {
  if (!value || typeof value !== "object") return { outcome: "unverified" }
  const result = value as Record<string, unknown>
  const applicationId = typeof result.recruitapply_idx === "number" && Number.isSafeInteger(result.recruitapply_idx) ? String(result.recruitapply_idx) : result.recruitapply_idx
  const recId = typeof result.rec_idx === "number" && Number.isSafeInteger(result.rec_idx) ? String(result.rec_idx) : result.rec_idx
  if (result.code !== "success" || !NumericIdSchema.safeParse(applicationId).success || recId !== jobId) return { outcome: "unverified" }
  return { outcome: "success", sourceApplicationId: applicationId as string }
}
