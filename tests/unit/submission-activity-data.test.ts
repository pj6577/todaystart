import { expect, it } from "vitest"
import type { SubmissionAttempt } from "../../src/submission/model"
import { submissionActivityGroups } from "../../src/ui/submission-activity-data"
import { record } from "../helpers"

const attempt = (changes: Partial<SubmissionAttempt> = {}): SubmissionAttempt => ({
  id: crypto.randomUUID(), platform: "jobkorea", tabId: 1, frameId: 0, sourceJobId: "9000",
  requestId: crypto.randomUUID(),
  context: { sourceJobId: "100", internalGiNo: "9000", companyName: "가상 지원 기업", jobTitle: "디자이너", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/100" },
  stage: "unverified", reason: "navigation", startedAt: "2026-10-28T01:00:00Z", updatedAt: "2026-10-28T01:02:00Z", ...changes
})
const context = (sourceJobId: string, internalGiNo: string) => ({ sourceJobId, internalGiNo, companyName: "가상 지원 기업", jobTitle: "디자이너", jobUrl: `https://www.jobkorea.co.kr/Recruit/GI_Read/${sourceJobId}` })

it("groups verified public and internal form IDs and prefers an existing record over a new manual form", () => {
  const owner = attempt(), opened = attempt({ stage: "started", requestId: undefined, updatedAt: "2026-10-28T02:00:00Z" }), retry = attempt({ context: undefined, updatedAt: "2026-10-28T02:01:00Z" })
  const pending = record({ platform: "jobkorea", submissionAttemptId: owner.id, status: "pending_confirmation", submissionStage: "unverified" })
  const groups = submissionActivityGroups([owner, opened, retry], [pending])
  expect(groups).toHaveLength(1)
  expect(groups[0]).toMatchObject({ attempt: owner, record: pending })
  expect(groups[0]!.attempts.map(item => item.id)).toEqual([owner.id, retry.id])
})

it("keeps platforms, different postings at the same company, and unverified internal IDs separate", () => {
  const base = attempt()
  const other = attempt({ context: context("101", "9001"), sourceJobId: "9001" })
  const saramin = attempt({ platform: "saramin", sourceJobId: "100", context: { ...base.context!, internalGiNo: undefined, jobUrl: "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=100" } })
  const unknown = attempt({ sourceJobId: "100", context: undefined })
  expect(submissionActivityGroups([base, other, saramin, unknown], [])).toHaveLength(4)
})

it("does not guess an internal ID mapping when verified contexts disagree", () => {
  const one = attempt(), other = attempt({ context: context("101", "9000") }), unknown = attempt({ context: undefined })
  expect(submissionActivityGroups([one, other, unknown], [])).toHaveLength(3)
})

it("can recover a contextless form's posting identity from an existing verified record", () => {
  const one = attempt({ context: undefined }), other = attempt({ sourceJobId: "9001", context: context("100", "9001") })
  const pending = record({ platform: "jobkorea", sourceJobId: "100", internalGiNo: "9000", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/100", submissionAttemptId: one.id, status: "pending_confirmation" })
  expect(submissionActivityGroups([one, other], [pending])).toHaveLength(1)
  const conflicting = { ...pending, jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/101" }
  expect(submissionActivityGroups([one, other], [conflicting])).toHaveLength(2)
})

it.each(["applied", "cancelled"] as const)("hides the whole posting/day notice after a linked %s outcome without changing stored data", status => {
  const owner = attempt(), retry = attempt({ context: undefined }), laterDay = attempt({ startedAt: "2026-10-28T15:01:00Z" })
  const original = structuredClone([owner, retry, laterDay])
  const resolved = record({ platform: "jobkorea", submissionAttemptId: owner.id, status })
  const groups = submissionActivityGroups([owner, retry, laterDay], [resolved])
  expect(groups).toHaveLength(1)
  expect(groups[0]!.attempt.id).toBe(laterDay.id)
  expect([owner, retry, laterDay]).toEqual(original)
})

it("keeps unrelated platforms and older application history from resolving a notice", () => {
  const owner = attempt(), wrongSite = record({ platform: "saramin", submissionAttemptId: owner.id, status: "applied" })
  const older = record({ platform: "jobkorea", sourceJobId: "100", status: "applied", appliedAt: "2026-10-20" })
  expect(submissionActivityGroups([owner], [wrongSite, older])).toHaveLength(1)
})

it("groups by the Korean submission day and keeps new days visible", () => {
  const before = attempt({ startedAt: "2026-10-28T14:59:00Z" }), after = attempt({ startedAt: "2026-10-28T15:01:00Z" })
  expect(submissionActivityGroups([before, after], [])).toHaveLength(2)
  expect(submissionActivityGroups([{ ...before, clickedAt: "2026-10-28T15:01:30Z" }, after], [])).toHaveLength(1)
})

it("omits opened-only notices and keeps actionable results ahead of opened tabs", () => {
  const opened = attempt({ stage: "started", requestId: undefined }), waiting = attempt({ stage: "submitting" }), unverified = attempt()
  expect(submissionActivityGroups([opened], [])).toEqual([])
  expect(submissionActivityGroups([opened, waiting, unverified], [])[0]!.attempt.id).toBe(unverified.id)
})

it.each(["closed", "timeout", "navigation", "result_unknown"] as const)("hides legacy Jobkorea notices without a submitted request: %s", reason => {
  const old = attempt({ stage: "unverified", reason, requestId: undefined })
  const original = structuredClone(old)
  expect(submissionActivityGroups([old], [])).toEqual([])
  expect(old).toEqual(original)
})

it.each(["submitting", "unverified"] as const)("a Jobkorea button click without a request may be validation/cancellation, not an actionable %s notice", stage => {
  const click = attempt({ stage, requestId: undefined, clickedAt: "2026-10-28T01:00:10Z" })
  expect(submissionActivityGroups([click], [])).toEqual([])
  const submitted = attempt({ ...click, requestId: crypto.randomUUID() })
  expect(submissionActivityGroups([submitted], [])[0]!.attempt).toEqual(submitted)
})

it("keeps independent completion evidence and Wanted's existing click-based review behavior", () => {
  const completed = attempt({ requestId: undefined, context: undefined, stage: "confirmed" })
  const wanted = attempt({ platform: "wanted", requestId: undefined, clickedAt: "2026-10-28T01:00:10Z", context: undefined })
  expect(submissionActivityGroups([completed, wanted], [])).toHaveLength(2)
})

it("hides a confirmed posting's redundant notices but preserves a contextless completion needing manual details", () => {
  expect(submissionActivityGroups([attempt({ stage: "confirmed" }), attempt()], [])).toEqual([])
  const unknown = attempt({ context: undefined, stage: "confirmed" })
  expect(submissionActivityGroups([unknown], [])[0]!.attempt).toEqual(unknown)
})

it("dismisses all member IDs together while preserving a later independent notice", () => {
  const one = attempt(), two = attempt({ context: undefined }), groups = submissionActivityGroups([one, two], [])
  const dismissed = groups.flatMap(group => group.attempts.map(attempt => attempt.id))
  expect(submissionActivityGroups([one, two], [], dismissed)).toEqual([])
  const later = attempt()
  expect(submissionActivityGroups([one, two, later], [], dismissed)[0]!.attempts).toEqual([later])
})
