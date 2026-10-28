import type { ManualApplication } from "../core/model"
import { safeJobUrl } from "../core/urls"
import type { SubmissionAttempt } from "../submission/model"

export interface ManualApplicationPrefill {
  application: Partial<ManualApplication>
  submissionAttemptId: string
  dateHint: string
}

export function manualApplicationPrefill(attempt: SubmissionAttempt): ManualApplicationPrefill {
  const context = attempt.context
  // Jobkorea's attempt ID belongs to OnPass, not its public GI_Read posting.
  const publicId = context?.sourceJobId || (attempt.platform !== "jobkorea" ? attempt.sourceJobId : undefined)
  const canonical = publicId ? attempt.platform === "wanted" ? `https://www.wanted.co.kr/wd/${publicId}` : attempt.platform === "saramin" ? `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${publicId}` : `https://www.jobkorea.co.kr/Recruit/GI_Read/${publicId}` : undefined
  const observedAt = attempt.clickedAt || (attempt.stage === "confirmed" ? attempt.updatedAt : attempt.startedAt)
  const date = new Date(Date.parse(observedAt) + 9 * 60 * 60 * 1000)
  return {
    submissionAttemptId: attempt.id,
    application: {
      platform: attempt.platform,
      companyName: context?.companyName || "",
      jobTitle: context?.jobTitle || "",
      appliedAt: Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "",
      jobUrl: safeJobUrl(context?.jobUrl, attempt.platform) || canonical || ""
    },
    dateHint: attempt.clickedAt ? "지원 버튼을 누른 날짜를 미리 채웠어요. 실제 지원 날짜를 확인해 주세요." : attempt.stage === "confirmed" ? "지원 완료를 확인한 날짜를 미리 채웠어요. 필요하면 수정해 주세요." : "지원창을 연 날짜를 미리 채웠어요. 실제 지원 날짜와 완료 여부를 확인해 주세요."
  }
}
