import { expect, it } from "vitest"
import type { SubmissionAttempt } from "../../src/submission/model"
import { manualApplicationPrefill } from "../../src/ui/manual-application-prefill"

const attempt = (changes: Partial<SubmissionAttempt> = {}): SubmissionAttempt => ({ id: crypto.randomUUID(), platform: "wanted", tabId: 1, frameId: 0, sourceJobId: "100", stage: "unverified", reason: "timeout", startedAt: "2026-10-20T14:55:00Z", clickedAt: "2026-10-20T15:05:00Z", updatedAt: "2026-10-21T16:00:00Z", ...changes })

it("prefills observed company, role, source, sanitized URL and the clicked day in Korea", () => {
  const source = attempt({ context: { sourceJobId: "100", companyName: "지원 기업", jobTitle: "웹 개발자", jobUrl: "https://www.wanted.co.kr/wd/100?token=private#apply" } })
  const initial = manualApplicationPrefill(source)
  expect(initial.submissionAttemptId).toBe(source.id)
  expect(initial.application).toEqual({ platform: "wanted", companyName: "지원 기업", jobTitle: "웹 개발자", appliedAt: "2026-10-21", jobUrl: "https://www.wanted.co.kr/wd/100" })
  expect(initial.dateHint).toContain("지원 버튼을 누른 날짜")
})

it("uses the observed opening day as an explicitly editable suggestion when no click is known", () => {
  const initial = manualApplicationPrefill(attempt({ clickedAt: undefined }))
  expect(initial.application.appliedAt).toBe("2026-10-20")
  expect(initial.dateHint).toContain("지원창을 연 날짜")
  expect(initial.dateHint).toContain("실제 지원 날짜와 완료 여부")
})

it("uses the completion observation date when a confirmed attempt has no click", () => {
  const initial = manualApplicationPrefill(attempt({ clickedAt: undefined, stage: "confirmed" }))
  expect(initial.application.appliedAt).toBe("2026-10-22")
  expect(initial.dateHint).toContain("지원 완료를 확인한 날짜")
})

it.each([
  ["wanted", "https://www.wanted.co.kr/wd/100"],
  ["saramin", "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=100"],
  ["jobkorea", ""]
] as const)("prefills only known fields for a contextless %s attempt", (platform, jobUrl) => {
  const initial = manualApplicationPrefill(attempt({ platform }))
  expect(initial.application).toMatchObject({ companyName: "", jobTitle: "", platform, jobUrl })
})

it("uses Jobkorea's verified public posting ID rather than its internal OnPass ID", () => {
  const initial = manualApplicationPrefill(attempt({ platform: "jobkorea", sourceJobId: "51797123", context: { sourceJobId: "50194254", internalGiNo: "51797123", companyName: "지원 기업", jobTitle: "개발자", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/50194254?token=private" } }))
  expect(initial.application.jobUrl).toBe("https://www.jobkorea.co.kr/Recruit/GI_Read/50194254")
})
