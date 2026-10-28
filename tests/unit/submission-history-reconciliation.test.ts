import { expect, it } from "vitest"
import { importedSubmissionMatches } from "../../src/submission/history-reconciliation"
import type { SubmissionAttempt } from "../../src/submission/model"
import type { ApplicationRecord } from "../../src/core/model"
import { record } from "../helpers"

const attempt = (changes: Partial<SubmissionAttempt> = {}): SubmissionAttempt => ({
  id: crypto.randomUUID(), platform: "jobkorea", tabId: 1, frameId: 0, sourceJobId: "9000",
  context: { sourceJobId: "100", internalGiNo: "9000", companyName: "이전 이름", jobTitle: "이전 공고 제목", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/100" },
  stage: "unverified", reason: "timeout", clickedAt: "2026-10-27T15:01:00Z", startedAt: "2026-10-27T15:00:00Z", updatedAt: "2026-10-27T15:02:00Z", ...changes
})
const history = (changes: Partial<ApplicationRecord> = {}) => record({
  platform: "jobkorea", sourceJobId: "100", sourceApplicationId: "7000", companyName: "새 이름", jobTitle: "새 공고 제목",
  jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/100", appliedAt: "2026-10-28",
  collectedAt: "2026-10-27T15:03:00Z", lastSeenAt: "2026-10-27T15:03:00Z", lastSyncedAt: "2026-10-27T15:03:00Z", ...changes
})

it("uses the verified public posting and Korean application day, including a URL-only posting ID", () => {
  const pending = attempt(), imported = history({ sourceJobId: undefined })
  expect(importedSubmissionMatches([pending], [imported]).get(pending.id)).toEqual(imported)
})

it.each([
  { platform: "saramin" }, { sourceJobId: "101" }, { appliedAt: "2026-10-27" },
  { appliedAt: "2026-10-29" }, { status: "unknown" }, { status: "pending_confirmation" },
  { status: "cancelled" }, { evidence: "manual" }, { appliedAt: undefined },
  { collectedAt: "2026-10-27T14:59:00Z" }, { appliedAtTime: "2026-10-27T14:59:00Z" },
  { submissionAttemptId: "00000000-0000-4000-8000-000000000001" },
  { jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/101" }
] satisfies Partial<ApplicationRecord>[]) ("does not infer completion from unrelated or older evidence: %j", changes => {
  expect(importedSubmissionMatches([attempt()], [history(changes)]).size).toBe(0)
})

it("does not confuse Jobkorea's internal giNo with a public posting ID", () => {
  expect(importedSubmissionMatches([attempt({ context: undefined, sourceJobId: "100" })], [history()]).size).toBe(0)
})

it("does not confirm a form that was only opened, or an already confirmed attempt", () => {
  expect(importedSubmissionMatches([attempt({ clickedAt: undefined, stage: "started" })], [history()]).size).toBe(0)
  expect(importedSubmissionMatches([attempt({ stage: "confirmed" })], [history()]).size).toBe(0)
})

it("leaves multiple same-day applications or competing submission attempts unresolved", () => {
  expect(importedSubmissionMatches([attempt()], [history(), history({ sourceApplicationId: "7001" })]).size).toBe(0)
  expect(importedSubmissionMatches([attempt(), attempt()], [history()]).size).toBe(0)
})

it("an explicit record owner disambiguates multiple attempts without reassigning it", () => {
  const owner = attempt(), other = attempt(), imported = history({ submissionAttemptId: owner.id })
  const matches = importedSubmissionMatches([owner, other], [imported])
  expect(matches.get(owner.id)).toEqual(imported)
  expect(matches.has(other.id)).toBe(false)
})
