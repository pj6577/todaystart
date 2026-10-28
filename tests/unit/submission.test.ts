import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { SubmissionTracker } from "../../src/submission/tracker"
import { applicationPage, saraminCompletion, saraminResult } from "../../src/submission/model"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"
import { applicationIdentity } from "../../src/core/identity"
import { record } from "../helpers"

let repository: ApplicationRepository, tracker: SubmissionTracker, stored: Record<string, unknown>
const jobId = "12345", requestId = "00000000-0000-4000-8000-000000000001"
const context = { sourceJobId: jobId, companyName: "검증 기업", jobTitle: "웹 개발자", jobUrl: `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${jobId}` }
const sender = (changes: Partial<chrome.runtime.MessageSender> = {}): chrome.runtime.MessageSender => ({ id: "test", url: `https://www.saramin.co.kr/zf_user/member/apply?rec_idx=${jobId}`, tab: { id: 1 } as chrome.tabs.Tab, frameId: 2, documentId: "apply-document", ...changes })
async function metadata() { await tracker.observe({ kind: "context", platform: "saramin", context }, sender({ frameId: 0, url: context.jobUrl })) }
async function submitting() { await tracker.observe({ kind: "submitting", platform: "saramin", sourceJobId: jobId, requestId }, sender()) }
async function jobkoreaMetadata() {
  const posting = { ...context, sourceJobId: "50194254", internalGiNo: "51797123", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/50194254" }
  await tracker.observe({ kind: "context", platform: "jobkorea", context: posting }, sender({ frameId: 0, url: posting.jobUrl }))
  return sender({ frameId: 0, url: "https://www.jobkorea.co.kr/Recruit/OnPass?giNo=51797123" })
}
beforeEach(() => {
  stored = {}
  vi.stubGlobal("chrome", { storage: { local: {
    get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(stored[key])])),
    set: async (values: Record<string, unknown>) => { Object.assign(stored, structuredClone(values)) }
  } } })
  repository = new ApplicationRepository(new TodayStartDatabase("submission-" + crypto.randomUUID()))
  tracker = new SubmissionTracker(repository)
})
afterEach(async () => { await repository.db.delete(); vi.unstubAllGlobals() })

it("지원 화면 진입은 started만 저장하고 제출 전에는 지원 기록을 만들지 않는다", async () => {
  await metadata()
  await tracker.observe({ kind: "entered", platform: "saramin", sourceJobId: jobId }, sender())
  expect((await tracker.snapshot())[0]?.stage).toBe("started")
  expect(await repository.list()).toHaveLength(0)
})
it("최종 POST → worker 재생성 → 성공 응답으로 같은 대기를 지원 ID 한 건으로 승격한다", async () => {
  await metadata(); await submitting()
  expect((await repository.list())[0]).toMatchObject({ status: "pending_confirmation", submissionStage: "submitting" })
  expect((await repository.list())[0]?.appliedAt).toBeUndefined()
  tracker = new SubmissionTracker(repository)
  await tracker.observe({ kind: "result", platform: "saramin", sourceJobId: jobId, requestId, outcome: "success", sourceApplicationId: "7788" }, sender())
  const records = await repository.list()
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ status: "applied", sourceApplicationId: "7788", evidence: "submission_result" })
  expect(records[0]?.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await tracker.observe({ kind: "result", platform: "saramin", sourceJobId: jobId, requestId, outcome: "unverified" }, sender())
  expect((await tracker.snapshot())[0]?.stage).toBe("confirmed")
  expect(await repository.list()).toHaveLength(1)
})
it("페어가 없는 성공·다른 프레임·다른 문서의 성공은 기록하지 않는다", async () => {
  const response = { kind: "result" as const, platform: "saramin" as const, sourceJobId: jobId, requestId, outcome: "success" as const, sourceApplicationId: "7788" }
  expect(await tracker.observe(response, sender())).toBe(false)
  await metadata(); await submitting()
  expect(await tracker.observe(response, sender({ frameId: 3 }))).toBe(false)
  expect(await tracker.observe(response, sender({ documentId: "other-document" }))).toBe(false)
  expect((await repository.list())[0]?.status).toBe("pending_confirmation")
})
it("재시도 이전 응답은 무시하고 200 실패 결과도 unverified로 유지한다", async () => {
  await metadata(); await submitting()
  await tracker.observe({ kind: "submitting", platform: "saramin", sourceJobId: jobId, requestId: "00000000-0000-4000-8000-000000000002" }, sender())
  expect(await tracker.observe({ kind: "result", platform: "saramin", sourceJobId: jobId, requestId, outcome: "success", sourceApplicationId: "7788" }, sender())).toBe(false)
  await tracker.observe({ kind: "result", platform: "saramin", sourceJobId: jobId, requestId: "00000000-0000-4000-8000-000000000002", outcome: "unverified" }, sender())
  expect((await tracker.snapshot())[0]?.stage).toBe("unverified")
  expect((await repository.list())[0]?.status).toBe("pending_confirmation")
})
it("잡코리아 native form 제출과 새 결과 문서를 완료로 오인하지 않는다", async () => {
  const jk = sender({ url: "https://www.jobkorea.co.kr/Recruit/OnPass?giNo=12345", frameId: 0 })
  await tracker.observe({ kind: "context", platform: "jobkorea", context: { ...context, jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/12345" } }, { ...jk, url: "https://www.jobkorea.co.kr/Recruit/GI_Read/12345" })
  await tracker.observe({ kind: "submitting", platform: "jobkorea", sourceJobId: jobId, requestId }, jk)
  await tracker.observe({ kind: "landed", platform: "jobkorea" }, { ...jk, url: "https://www.jobkorea.co.kr/Recruit/OnPass/OnPassApply", documentId: "result-document" })
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "unverified", reason: "navigation" })
  expect((await repository.list())[0]?.status).toBe("pending_confirmation")
  await expect(tracker.observe({ kind: "result", platform: "jobkorea", sourceJobId: jobId, requestId, outcome: "success", sourceApplicationId: "99" }, jk)).rejects.toThrow()
})
it("지원창에 기업 정보가 없으면 추측하지 않고 나중에 같은 공고 정보가 도착하면 저장한다", async () => {
  await submitting()
  await tracker.observe({ kind: "result", platform: "saramin", sourceJobId: jobId, requestId, outcome: "success", sourceApplicationId: "7788" }, sender())
  expect(await repository.list()).toHaveLength(0)
  await metadata()
  expect((await repository.list())[0]).toMatchObject({ companyName: "검증 기업", sourceApplicationId: "7788", status: "applied" })
})
it("다른 탭의 같은 공고 메타데이터를 임의 연결하지 않는다", async () => {
  await metadata()
  await tracker.observe({ kind: "submitting", platform: "saramin", sourceJobId: jobId, requestId }, sender({ tab: { id: 9 } as chrome.tabs.Tab }))
  expect((await tracker.snapshot())[0]?.context).toBeUndefined()
  expect(await repository.list()).toHaveLength(0)
})
it("새 지원창의 원래 공고가 늦게 준비되어도 opener 관계로만 보강한다", async () => {
  await tracker.observe({ kind: "submitting", platform: "saramin", sourceJobId: jobId, requestId }, sender({ tab: { id: 9, openerTabId: 1 } as chrome.tabs.Tab }))
  expect(await repository.list()).toHaveLength(0)
  await metadata()
  expect((await repository.list())[0]).toMatchObject({ companyName: "검증 기업", status: "pending_confirmation" })
})
it("제출 없이 지원창을 닫아도 지원 기록을 만들지 않는다", async () => {
  await metadata()
  await tracker.observe({ kind: "entered", platform: "saramin", sourceJobId: jobId }, sender())
  await tracker.closeTab(1)
  expect((await tracker.snapshot())[0]?.stage).toBe("unverified")
  expect(await repository.list()).toHaveLength(0)
})
it("45초 만료와 탭 닫기는 unverified이며 완료가 아니다", async () => {
  await metadata(); await submitting()
  const attempts = stored.submissionAttempts as { updatedAt: string }[]
  attempts[0]!.updatedAt = new Date(Date.now() - 46000).toISOString()
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "unverified", reason: "timeout" })
  await tracker.observe({ kind: "submitting", platform: "saramin", sourceJobId: jobId, requestId: crypto.randomUUID() }, sender())
  await tracker.closeTab(1)
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "unverified", reason: "closed" })
  expect((await repository.list())[0]?.status).toBe("pending_confirmation")
})
it("사용자 확인과 이력 수집은 대기 기록을 해소한다", async () => {
  await metadata(); await submitting()
  const pending = (await repository.list())[0]!
  await repository.edit(pending.id, { companyName: pending.companyName, jobTitle: pending.jobTitle, appliedAt: "2026-10-20", status: "applied" })
  await tracker.reconcile()
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "confirmed", reason: "manual" })
})
it("잡코리아 최종 클릭만 관찰한 항목도 가져온 같은 공고·날짜의 지원 완료와 연결한다", async () => {
  const popup = await jobkoreaMetadata()
  await tracker.observe({ kind: "apply_clicked", platform: "jobkorea", sourceJobId: "51797123" }, popup)
  await tracker.closeTab(1)
  expect(await repository.list()).toHaveLength(0)
  const attempt = (await tracker.snapshot())[0]!
  const now = new Date(Date.now() + 1000).toISOString()
  await repository.merge([record({ platform: "jobkorea", companyName: context.companyName, jobTitle: context.jobTitle, sourceJobId: "50194254", sourceApplicationId: "7800", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/50194254", appliedAt: new Date(Date.parse(attempt.clickedAt!) + 9 * 3600000).toISOString().slice(0, 10), collectedAt: now, lastSeenAt: now, lastSyncedAt: now })])
  await tracker.reconcile()
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "confirmed", reason: "success" })
  expect((await repository.list())[0]).toMatchObject({ submissionAttemptId: attempt.id, submissionStage: "confirmed", evidence: "history_page" })
})
it("같은 공고의 이력 제목이 달라도 대기를 해소하고 연결한 메모를 보존한다", async () => {
  await metadata(); await submitting()
  const attempt = (await tracker.snapshot())[0]!, pending = (await repository.list())[0]!
  const link = (await repository.plannerSnapshot()).links.find(value => value.recordId === pending.id)!
  const note = await repository.saveNote({ id: crypto.randomUUID(), expectedRevision: 0, title: "연결한 메모", body: "보존할 내용", pinned: false, checklist: [], linkId: link.id })
  const now = new Date(Date.now() + 1000).toISOString()
  await repository.merge([record({ companyName: context.companyName, jobTitle: `${context.jobTitle} (~12/31)`, sourceJobId: jobId, sourceApplicationId: "7900", jobUrl: context.jobUrl, appliedAt: new Date(Date.parse(attempt.startedAt) + 9 * 3600000).toISOString().slice(0, 10), collectedAt: now, lastSeenAt: now, lastSyncedAt: now })])
  expect(await repository.list()).toHaveLength(2)
  // Reopening the manager must also heal records imported before this fix.
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "confirmed", reason: "success" })
  const records = await repository.list(), planner = await repository.plannerSnapshot()
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ sourceApplicationId: "7900", submissionAttemptId: attempt.id, submissionStage: "confirmed", evidence: "history_page" })
  const savedNote = planner.notes.find(value => value.id === note.id)!
  expect(savedNote.body).toBe("보존할 내용")
  expect(planner.links.find(value => value.id === savedNote.linkId)?.recordId).toBe(records[0]!.id)
})
it("지원 현황으로 확정한 뒤 늦게 공고 정보가 도착해도 API 성공 기록으로 다시 만들지 않는다", async () => {
  await submitting()
  const attempt = (await tracker.snapshot())[0]!, now = new Date(Date.now() + 1000).toISOString()
  await repository.merge([record({ companyName: context.companyName, jobTitle: `${context.jobTitle} 변경 제목`, sourceJobId: jobId, sourceApplicationId: "8100", jobUrl: context.jobUrl, appliedAt: new Date(Date.parse(attempt.startedAt) + 9 * 3600000).toISOString().slice(0, 10), collectedAt: now, lastSeenAt: now, lastSyncedAt: now })])
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "confirmed", confirmationMethod: "history_page" })
  await metadata()
  expect(await repository.list()).toHaveLength(1)
  expect((await repository.list())[0]).toMatchObject({ evidence: "history_page", sourceApplicationId: "8100", jobTitle: `${context.jobTitle} 변경 제목` })
})
it.each([
  { code: "fail", recruitapply_idx: "1", rec_idx: jobId },
  { code: "duplicate", recruitapply_idx: "1", rec_idx: jobId },
  { code: "success", recruitapply_idx: "1", rec_idx: "other" },
  { code: "success", rec_idx: jobId },
  { code: "success", recruitapply_idx: Number.MAX_SAFE_INTEGER + 1, rec_idx: jobId },
  { status: 200 }, null
])("성공 코드와 두 식별자의 정확한 근거가 없으면 완료하지 않는다: %j", value => expect(saraminResult(value, jobId)).toEqual({ outcome: "unverified" }))
it("성공 응답은 허용된 ID만 투영하고 content·이력서는 전달하지 않는다", () => {
  expect(saraminResult({ code: "success", recruitapply_idx: 7788, rec_idx: 12345, content: "SECRET", resume: "SECRET" }, jobId)).toEqual({ outcome: "success", sourceApplicationId: "7788" })
})
it("지원 진입과 결과 URL을 구분하고 다른 경로는 무시한다", () => {
  expect(applicationPage("https://www.jobkorea.co.kr/Recruit/OnPass?giNo=12345")).toMatchObject({ platform: "jobkorea", jobId, result: false })
  expect(applicationPage("https://www.jobkorea.co.kr/Recruit/OnPass/OnPassApply")).toMatchObject({ result: true })
  expect(applicationPage("https://www.saramin.co.kr/zf_user/member/apply/check-open-layer-condition")).toBeUndefined()
})

it("실제 OnPassResult 주소의 gNo는 공개 공고 ID로 읽고 이력서·기타 식별자는 전달하지 않는다", () => {
  const page = applicationPage("https://www.jobkorea.co.kr/Recruit/OnPass/OnPassResult?gNo=50194254&R_No=111&PartIdx=222&co_pass_no=333&logpath=1&sc=630")
  expect(page).toMatchObject({ platform: "jobkorea", result: true, postingId: "50194254" })
  expect(page?.jobId).toBeUndefined()
  expect(JSON.stringify(page)).not.toMatch(/R_No|PartIdx|co_pass_no|logpath|sc/)
  expect(applicationPage("https://www.jobkorea.co.kr/Recruit/OnPass/OnPassResult/other?gNo=50194254")).toBeUndefined()
  expect(applicationPage("https://example.com/Recruit/OnPass/OnPassResult?gNo=50194254")).toBeUndefined()
})

it.each([0, 2])("OnPassResult의 새 문서에서 공개 gNo로 기존 제출을 자동 완료하고 재관찰은 중복 저장하지 않는다: frame %s", async frameId => {
  const popup = { ...await jobkoreaMetadata(), frameId }
  await tracker.observe({ kind: "submitting", platform: "jobkorea", sourceJobId: "51797123", requestId }, popup)
  const result = { ...popup, url: "https://www.jobkorea.co.kr/Recruit/OnPass/OnPassResult?gNo=50194254&R_No=111&PartIdx=222&co_pass_no=333", documentId: "actual-result-document" }
  await tracker.observe({ kind: "landed", platform: "jobkorea" }, result)
  expect((await repository.list())[0]).toMatchObject({ status: "pending_confirmation", submissionStage: "unverified" })
  tracker = new SubmissionTracker(repository)
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, result)).toBe(true)
  await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, result)
  const records = await repository.list()
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ status: "applied", sourceJobId: "50194254", internalGiNo: "51797123", evidence: "success_page" })
  expect(JSON.stringify(records)).not.toMatch(/R_No|PartIdx|co_pass_no/)
})

it("OnPassResult는 다른 공고 gNo·다른 프레임·누락되거나 충돌하는 gNo로 완료하지 않는다", async () => {
  const popup = await jobkoreaMetadata()
  await tracker.observe({ kind: "submitting", platform: "jobkorea", sourceJobId: "51797123", requestId }, popup)
  for (const query of ["gNo=99", "gNo=51797123", "", "gNo=invalid", "gNo=50194254&GNO=99"]) {
    expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, { ...popup, url: `https://www.jobkorea.co.kr/Recruit/OnPass/OnPassResult?${query}` })).toBe(false)
  }
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, { ...popup, frameId: 5, url: "https://www.jobkorea.co.kr/Recruit/OnPass/OnPassResult?gNo=50194254" })).toBe(false)
  expect((await repository.list())[0]?.status).toBe("pending_confirmation")
})

const completionUrl = `https://www.saramin.co.kr/zf_user/member/apply/complete?rec_idx=${jobId}&recruitapply_idx=7788`
const completed = { kind: "completed" as const, platform: "saramin" as const, sourceJobId: jobId, sourceApplicationId: "7788" }
it("새 완료 문서는 POST 응답 없이도 기존 대기를 한 건의 완료 기록으로 승격한다", async () => {
  await metadata(); await submitting()
  tracker = new SubmissionTracker(repository)
  const completionSender = sender({ url: completionUrl, documentId: "completion-document" })
  await tracker.observe(completed, completionSender)
  await tracker.observe(completed, completionSender)
  expect(await repository.list()).toHaveLength(1)
  expect((await repository.list())[0]).toMatchObject({ status: "applied", sourceApplicationId: "7788", sourceJobId: jobId, evidence: "success_page" })
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "confirmed", confirmationMethod: "completion_page" })
  expect(stored.revision).toBeTruthy()
})
it("네트워크 제출을 관찰하지 못해도 완료 URL과 표시를 확인한 결과를 저장한다", async () => {
  await metadata()
  await tracker.observe(completed, sender({ url: completionUrl, documentId: "completion-document" }))
  expect((await repository.list())[0]).toMatchObject({ status: "applied", sourceApplicationId: "7788", evidence: "success_page" })
  expect((await tracker.snapshot())[0]?.requestId).toBeUndefined()
})
it("완료가 공고 정보보다 먼저 와도 나중에 실제 회사·직무를 연결한다", async () => {
  await tracker.observe(completed, sender({ url: completionUrl, documentId: "completion-document" }))
  expect(await repository.list()).toHaveLength(0)
  await tracker.observe({ kind: "context", platform: "saramin", context }, sender({ url: completionUrl, documentId: "completion-document" }))
  expect((await repository.list())[0]).toMatchObject({ status: "applied", companyName: context.companyName })
})
it("실제 완료 URL의 공고·지원 ID와 다른 이벤트는 거절한다", async () => {
  await expect(tracker.observe(completed, sender())).rejects.toThrow()
  await expect(tracker.observe({ ...completed, sourceApplicationId: "99" }, sender({ url: completionUrl }))).rejects.toThrow()
  await expect(tracker.observe({ ...completed, sourceJobId: "99" }, sender({ url: completionUrl }))).rejects.toThrow()
  expect(await repository.list()).toHaveLength(0)
})
it("완료 문서 파서는 실제 경로·두 숫자 ID·완료 문구를 함께 요구한다", () => {
  expect(saraminCompletion(completionUrl, "안내\n입사지원 완료!\n지원내역 보기")).toEqual(completed)
  expect(saraminCompletion(completionUrl, "입사지원 오류")).toBeUndefined()
  expect(saraminCompletion(completionUrl.replace("7788", "bad"), "입사지원 완료!")).toBeUndefined()
  expect(saraminCompletion(completionUrl.replace("/complete", ""), "입사지원 완료!")).toBeUndefined()
  expect(saraminCompletion(completionUrl.replace("www.saramin.co.kr", "example.com"), "입사지원 완료!")).toBeUndefined()
})
it("잡코리아의 서로 다른 공개 공고 ID와 giNo를 팝업에서 명시적으로 연결한다", async () => {
  const publicId = "50194254", internalGiNo = "51797123"
  const posting = { ...context, sourceJobId: publicId, jobUrl: `https://www.jobkorea.co.kr/Recruit/GI_Read/${publicId}` }
  const opener = sender({ url: posting.jobUrl, frameId: 0 })
  const popup = sender({ url: `https://www.jobkorea.co.kr/Recruit/OnPass?giNo=${internalGiNo}`, tab: { id: 9, openerTabId: 1 } as chrome.tabs.Tab, frameId: 0 })
  await tracker.observe({ kind: "context", platform: "jobkorea", context: posting }, opener)
  await tracker.observe({ kind: "entered", platform: "jobkorea", sourceJobId: internalGiNo }, popup)
  expect((await tracker.snapshot())[0]?.context).toBeUndefined()
  await tracker.observe({ kind: "context", platform: "jobkorea", context: { ...posting, internalGiNo } }, popup)
  tracker = new SubmissionTracker(repository)
  await tracker.observe({ kind: "submitting", platform: "jobkorea", sourceJobId: internalGiNo, requestId }, popup)
  expect((await repository.list())[0]).toMatchObject({ sourceJobId: publicId, internalGiNo, status: "pending_confirmation", jobUrl: posting.jobUrl })
  await tracker.observe({ kind: "landed", platform: "jobkorea" }, { ...popup, url: "https://www.jobkorea.co.kr/Recruit/OnPass/OnPassApply", documentId: "result-document" })
  expect((await repository.list())[0]).toMatchObject({ sourceJobId: publicId, internalGiNo, status: "pending_confirmation", submissionStage: "unverified" })
  expect((await repository.list())[0]?.appliedAt).toBeUndefined()
  await expect(tracker.observe({ kind: "context", platform: "jobkorea", context: { ...posting, internalGiNo: "99" } }, popup)).rejects.toThrow()
})

it("잡코리아 제출 후 추가지원 표시를 확인하면 완료 한 건으로 승격하고 지원내역 ID 보강도 병합한다", async () => {
  const popup = await jobkoreaMetadata()
  await tracker.observe({ kind: "submitting", platform: "jobkorea", sourceJobId: "51797123", requestId }, popup)
  tracker = new SubmissionTracker(repository)
  const result = { ...popup, url: "https://www.jobkorea.co.kr/Recruit/OnPass/OnPassApply", documentId: "result-document" }
  await tracker.observe({ kind: "landed", platform: "jobkorea" }, result)
  await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, result)
  await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, result)
  const records = await repository.list()
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ status: "applied", evidence: "success_page", sourceJobId: "50194254", internalGiNo: "51797123" })
  expect(records[0]?.sourceApplicationId).toBeUndefined()
  expect(records[0]?.id).toContain("composite")
  const enriched = { ...records[0]!, sourceApplicationId: "history-7788", evidence: "history_page" as const }
  await repository.merge([{ ...enriched, id: applicationIdentity(enriched) }])
  expect(await repository.list()).toHaveLength(1)
  expect((await repository.list())[0]?.sourceApplicationId).toBe("history-7788")
})
it("잡코리아 네트워크를 놓쳐도 실제 지원 클릭 후 추가지원 표시로 완료를 저장한다", async () => {
  const popup = await jobkoreaMetadata()
  await tracker.observe({ kind: "apply_clicked", platform: "jobkorea", sourceJobId: "51797123" }, popup)
  expect(await repository.list()).toHaveLength(0)
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "submitting", reason: "waiting" })
  tracker = new SubmissionTracker(repository)
  await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, popup)
  expect((await repository.list())[0]).toMatchObject({ status: "applied", evidence: "success_page" })
  expect((await tracker.snapshot())[0]).toMatchObject({ confirmationMethod: "completion_marker" })
  expect((await tracker.snapshot())[0]?.requestId).toBeUndefined()
})
it("처음부터 추가지원 표시가 있거나 다른 프레임·공고면 새로운 완료 기록을 만들지 않는다", async () => {
  const popup = await jobkoreaMetadata()
  await tracker.observe({ kind: "entered", platform: "jobkorea", sourceJobId: "51797123" }, popup)
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, popup)).toBe(false)
  await tracker.observe({ kind: "apply_clicked", platform: "jobkorea", sourceJobId: "51797123" }, popup)
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, { ...popup, frameId: 9 })).toBe(false)
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, { ...popup, url: "https://www.jobkorea.co.kr/Recruit/OnPass?giNo=99" })).toBe(false)
  expect(await repository.list()).toHaveLength(0)
})

const handoffPublicId = "50194254", handoffGiNo = "51797123"
const handoffPosting = { ...context, sourceJobId: handoffPublicId, jobUrl: `https://www.jobkorea.co.kr/Recruit/GI_Read/${handoffPublicId}` }
const handoffDetail = (tabId = 1) => sender({ url: handoffPosting.jobUrl, frameId: 0, tab: { id: tabId } as chrome.tabs.Tab })
const handoffPopup = (tabId = 9, giNo = handoffGiNo, openerTabId?: number) => sender({ url: `https://www.jobkorea.co.kr/Recruit/OnPass?giNo=${giNo}`, frameId: 0, documentId: `popup-${tabId}`, tab: { id: tabId, openerTabId } as chrome.tabs.Tab })
const launch = { kind: "popup_link" as const, platform: "jobkorea" as const, sourceJobId: handoffPublicId, internalGiNo: handoffGiNo }
const popupEntered = { kind: "entered" as const, platform: "jobkorea" as const, sourceJobId: handoffGiNo }
const popupSubmit = { kind: "submitting" as const, platform: "jobkorea" as const, sourceJobId: handoffGiNo, requestId }

it("닫힌 이전 제출창이 남아 있어도 같은 공고의 현재 제출을 완료 표시와 연결한다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  await tracker.observe({ ...launch, launchId: crypto.randomUUID() }, handoffDetail())
  await tracker.observe(popupSubmit, handoffPopup(9))
  await tracker.observe({ kind: "landed", platform: "jobkorea" }, { ...handoffPopup(9), url: "https://www.jobkorea.co.kr/Recruit/OnPass/OnPassApply", documentId: "old-result" })
  await tracker.closeTab(9)
  await tracker.observe({ ...launch, launchId: crypto.randomUUID() }, handoffDetail())
  await tracker.observe({ ...popupSubmit, requestId: crypto.randomUUID() }, handoffPopup(10))
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, handoffDetail())).toBe(true)
  const attempts = await tracker.snapshot()
  expect(attempts.find(attempt => attempt.tabId === 10)?.stage).toBe("confirmed")
  expect(attempts.find(attempt => attempt.tabId === 9)?.stage).toBe("unverified")
  expect(attempts.find(attempt => attempt.tabId === 9)?.reason).toBe("navigation")
  expect(attempts.find(attempt => attempt.tabId === 9)?.closedAt).toBeDefined()
})

it("여러 창이 여전히 제출 중이면 원래 공고의 완료 표시를 임의 배정하지 않고 원인을 남긴다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  await tracker.observe({ ...launch, launchId: crypto.randomUUID() }, handoffDetail())
  await tracker.observe(popupSubmit, handoffPopup(9))
  await tracker.observe({ ...launch, launchId: crypto.randomUUID() }, handoffDetail())
  await tracker.observe({ ...popupSubmit, requestId: crypto.randomUUID() }, handoffPopup(10))
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, handoffDetail())).toBe(false)
  expect((await tracker.snapshot()).every(attempt => attempt.stage !== "confirmed" && attempt.completionIssue === "ambiguous_attempts")).toBe(true)
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, handoffPopup(10))).toBe(true)
  expect((await tracker.snapshot()).find(attempt => attempt.tabId === 10)?.completionIssue).toBeUndefined()
})

it("같은 결과창의 오래된 시도보다 방금 제출해서 열린 결과 문서 연결을 우선한다", async () => {
  const popup = await jobkoreaMetadata()
  await tracker.observe({ kind: "submitting", platform: "jobkorea", sourceJobId: "51797123", requestId }, popup)
  const current = (await tracker.snapshot())[0]!
  stored.submissionAttempts = [{ ...current, id: crypto.randomUUID(), sourceJobId: "51797000", context: { ...current.context!, internalGiNo: "51797000" }, stage: "unverified", reason: "navigation" }, current]
  const result = { ...popup, url: "https://www.jobkorea.co.kr/Recruit/OnPass/OnPassResult?gNo=50194254", documentId: "new-result-document" }
  await tracker.observe({ kind: "landed", platform: "jobkorea" }, result)
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, result)).toBe(true)
  const attempts = await tracker.snapshot()
  expect(attempts.find(attempt => attempt.id === current.id)?.stage).toBe("confirmed")
  expect(attempts.find(attempt => attempt.id !== current.id)?.stage).toBe("unverified")
})

it("완료 공고 정보 누락과 다른 공고의 결과를 구분해 기록하고 확인된 결과에서 원인을 해제한다", async () => {
  const popup = await jobkoreaMetadata()
  await tracker.observe({ kind: "submitting", platform: "jobkorea", sourceJobId: "51797123", requestId }, popup)
  const result = { ...popup, url: "https://www.jobkorea.co.kr/Recruit/OnPass/OnPassResult?gNo=99", documentId: "result" }
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, result)).toBe(false)
  expect((await tracker.snapshot())[0]?.completionIssue).toBe("posting_mismatch")
  const known = (await tracker.snapshot())[0]!
  stored.submissionAttempts = [{ ...known, context: undefined }]
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, { ...result, url: result.url.replace("gNo=99", "gNo=50194254") })).toBe(false)
  expect((await tracker.snapshot())[0]?.completionIssue).toBe("missing_context")
  stored.submissionAttempts = [known]
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, popup)).toBe(true)
  expect((await tracker.snapshot())[0]?.completionIssue).toBeUndefined()
})

it.each([0, 4])("검색 카드에서 바로 연 지원창의 공개 ID·giNo와 완료를 연결한다: frame %s", async frameId => {
  const listing = { ...handoffDetail(), url: "https://www.jobkorea.co.kr/Search?stext=react&Page_No=5" }
  const popup = frameId === 0 ? handoffPopup() : { ...handoffPopup(1), frameId }
  const posting = { ...handoffPosting, internalGiNo: handoffGiNo }
  await expect(tracker.observe(launch, listing)).rejects.toThrow()
  await tracker.observe({ kind: "context", platform: "jobkorea", context: posting }, listing)
  await tracker.observe(launch, listing)
  await tracker.observe(popupEntered, popup)
  expect((await tracker.snapshot())[0]).toMatchObject({ contextTabId: 1, context: posting })
  await tracker.observe({ kind: "apply_clicked", platform: "jobkorea", sourceJobId: handoffGiNo }, popup)
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea", postingId: "99" }, listing)).toBe(false)
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea", postingId: handoffPublicId }, listing)).toBe(true)
  expect((await repository.list())[0]).toMatchObject({ status: "applied", sourceJobId: handoffPublicId, internalGiNo: handoffGiNo })
})

it("잡코리아 noopener 팝업의 완료를 원래 공고 탭에 연결하고 launch 만료·창 닫기 뒤에도 보존한다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  await tracker.observe(launch, handoffDetail())
  await tracker.observe(popupEntered, handoffPopup())
  await tracker.observe({ kind: "apply_clicked", platform: "jobkorea", sourceJobId: handoffGiNo }, handoffPopup())
  expect((await tracker.snapshot())[0]).toMatchObject({ contextTabId: 1, stage: "submitting" })
  expect(await repository.list()).toHaveLength(0)
  const links = stored.submissionHandoffs as { observedAt: string }[]
  links[0]!.observedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString()
  tracker = new SubmissionTracker(repository)
  await tracker.closeTab(9)
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, handoffDetail(2))).toBe(false)
  expect(await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, handoffDetail())).toBe(true)
  expect((await repository.list())[0]).toMatchObject({ sourceJobId: handoffPublicId, internalGiNo: handoffGiNo, status: "applied" })
  await tracker.observe({ kind: "completion_marker", platform: "jobkorea" }, handoffDetail())
  expect(await repository.list()).toHaveLength(1)
})

it("잡코리아 최종 클릭만 있고 완료 표시가 없으면 시간 초과로 남기고 완료 기록을 만들지 않는다", async () => {
  const popup = await jobkoreaMetadata()
  await tracker.observe({ kind: "apply_clicked", platform: "jobkorea", sourceJobId: "51797123" }, popup)
  const attempts = stored.submissionAttempts as { updatedAt: string }[]
  attempts[0]!.updatedAt = new Date(Date.now() - 46000).toISOString()
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "unverified", reason: "timeout" })
  expect(await repository.list()).toHaveLength(0)
})

it("잡코리아 opener 없는 팝업은 먼저 관찰한 명시적 launch의 공개/internal 쌍만 연결하고 launch 자체는 시도를 만들지 않는다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  await tracker.observe(launch, handoffDetail())
  expect(await tracker.snapshot()).toHaveLength(0)
  expect(await repository.list()).toHaveLength(0)
  tracker = new SubmissionTracker(repository)
  await tracker.observe(popupEntered, handoffPopup())
  expect((await tracker.snapshot())[0]?.context).toMatchObject({ sourceJobId: handoffPublicId, internalGiNo: handoffGiNo })
  await tracker.observe(popupSubmit, handoffPopup())
  expect((await repository.list())[0]).toMatchObject({ sourceJobId: handoffPublicId, internalGiNo: handoffGiNo, status: "pending_confirmation" })
  expect((await repository.list())[0]?.appliedAt).toBeUndefined()
})
it.each(["before-entered", "after-entered", "after-submitting"] as const)("잡코리아 opener 없어도 명시적 launch 이후 늦은 공고 정보를 연결한다: %s", async timing => {
  await tracker.observe(launch, handoffDetail())
  if (timing !== "before-entered") await tracker.observe(popupEntered, handoffPopup())
  if (timing === "after-submitting") await tracker.observe(popupSubmit, handoffPopup())
  expect(await repository.list()).toHaveLength(0)
  tracker = new SubmissionTracker(repository)
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  await tracker.observe(popupSubmit, handoffPopup())
  expect(await repository.list()).toHaveLength(1)
  expect((await repository.list())[0]).toMatchObject({ sourceJobId: handoffPublicId, internalGiNo: handoffGiNo, status: "pending_confirmation" })
})
it("잡코리아 entered가 launch보다 먼저 와도 최근 유일한 팝업에만 명시적 쌍을 보강한다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  await tracker.observe(popupSubmit, handoffPopup())
  expect(await repository.list()).toHaveLength(0)
  await tracker.observe(launch, handoffDetail())
  expect((await repository.list())[0]).toMatchObject({ sourceJobId: handoffPublicId, internalGiNo: handoffGiNo })
})
it("잡코리아 명시적 launch 없이는 다른 탭의 같은 내부 ID 공고 정보를 추측하지 않는다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: { ...handoffPosting, internalGiNo: handoffGiNo } }, handoffDetail())
  await tracker.observe(popupSubmit, handoffPopup())
  await tracker.observe({ kind: "context", platform: "jobkorea", context: { ...handoffPosting, internalGiNo: handoffGiNo } }, handoffDetail())
  expect((await tracker.snapshot())[0]?.context).toBeUndefined()
  expect(await repository.list()).toHaveLength(0)
})
it("잡코리아 popup_link는 실제 상세 페이지의 공개 ID와 top frame 출처를 요구한다", async () => {
  await expect(tracker.observe({ ...launch, sourceJobId: "99" }, handoffDetail())).rejects.toThrow()
  await expect(tracker.observe(launch, { ...handoffDetail(), frameId: 1 })).rejects.toThrow()
  await expect(tracker.observe(launch, handoffPopup())).rejects.toThrow()
  await expect(tracker.observe(launch, { ...handoffDetail(), url: handoffPosting.jobUrl.replace("www.jobkorea.co.kr", "example.com") })).rejects.toThrow()
  expect(await tracker.snapshot()).toHaveLength(0)
  expect(stored.submissionHandoffs).toBeUndefined()
})
it("잡코리아 launch와 공고 metadata의 internal 쌍이 다르거나 실제 OnPass giNo가 다르면 연결하지 않는다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: { ...handoffPosting, internalGiNo: "99" } }, handoffDetail())
  await tracker.observe(launch, handoffDetail())
  await tracker.observe(popupSubmit, handoffPopup())
  expect((await tracker.snapshot())[0]?.context).toBeUndefined()
  await expect(tracker.observe(popupEntered, handoffPopup(10, "99"))).rejects.toThrow()
  await expect(tracker.observe(popupEntered, { ...handoffPopup(), url: "https://www.jobkorea.co.kr/Recruit/OnPass" })).rejects.toThrow()
  expect(await repository.list()).toHaveLength(0)
})
it("잡코리아 5분 지난 launch는 worker 재생성 뒤에도 opener 없는 팝업에 연결하지 않는다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  await tracker.observe(launch, handoffDetail())
  const links = stored.submissionHandoffs as { observedAt: string }[]
  links[0]!.observedAt = new Date(Date.now() - 5 * 60 * 1000 - 1).toISOString()
  tracker = new SubmissionTracker(repository)
  await tracker.observe(popupSubmit, handoffPopup())
  expect((await tracker.snapshot())[0]?.context).toBeUndefined()
  expect(stored.submissionHandoffs).toEqual([])
  expect(await repository.list()).toHaveLength(0)
})
it("잡코리아 opener 없는 팝업은 같은 내부 ID의 여러 명시적 launch가 있으면 추측하지 않는다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  await tracker.observe(launch, handoffDetail())
  await tracker.observe(launch, handoffDetail(2))
  await tracker.observe(popupSubmit, handoffPopup())
  expect((await tracker.snapshot())[0]?.context).toBeUndefined()
  expect(await repository.list()).toHaveLength(0)
})
it("잡코리아 여러 launch가 있어도 알려진 opener의 정확한 쌍을 우선하며 다른 opener로 fallback하지 않는다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  await tracker.observe(launch, handoffDetail())
  await tracker.observe(launch, handoffDetail(2))
  await tracker.observe(popupSubmit, handoffPopup(9, handoffGiNo, 1))
  expect((await tracker.snapshot())[0]?.context).toMatchObject({ sourceJobId: handoffPublicId, internalGiNo: handoffGiNo })
  await tracker.observe(popupSubmit, handoffPopup(10, handoffGiNo, 3))
  expect((await tracker.snapshot())[1]?.context).toBeUndefined()
})
it("잡코리아 명시적 launch의 연결을 다른 opener 없는 탭에 재사용하지 않는다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  await tracker.observe(launch, handoffDetail())
  await tracker.observe(popupSubmit, handoffPopup())
  tracker = new SubmissionTracker(repository)
  await tracker.observe(popupSubmit, handoffPopup(10))
  expect((await tracker.snapshot())[1]?.context).toBeUndefined()
  expect(await repository.list()).toHaveLength(1)
})
it("잡코리아 launch 후 여러 opener 없는 팝업이 먼저 관찰되면 늦은 공고 정보를 임의 연결하지 않는다", async () => {
  await tracker.observe(popupEntered, handoffPopup())
  await tracker.observe(popupEntered, handoffPopup(10))
  await tracker.observe(launch, handoffDetail())
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  expect((await tracker.snapshot()).every(value => !value.context)).toBe(true)
})
it("잡코리아 명시적 launch cache는 최근 100개로 제한하고 동일 launch 반복은 TTL을 연장하지 않는다", async () => {
  await tracker.observe(launch, handoffDetail())
  const links = stored.submissionHandoffs as { observedAt: string }[]
  const observedAt = new Date(Date.now() - 1000).toISOString()
  links[0]!.observedAt = observedAt
  await tracker.observe(launch, handoffDetail())
  expect((stored.submissionHandoffs as { observedAt: string }[])[0]?.observedAt).toBe(observedAt)
  for (let tabId = 2; tabId <= 101; tabId++) await tracker.observe(launch, handoffDetail(tabId))
  expect(stored.submissionHandoffs).toHaveLength(100)
  expect((stored.submissionHandoffs as { tabId: number }[])[0]?.tabId).toBe(2)
  expect(await tracker.snapshot()).toHaveLength(0)
})

it("잡코리아 같은 공고를 실제로 다시 연 새 launch ID는 새 팝업에 연결하고 동일 이벤트 재전송은 재사용하지 않는다", async () => {
  await tracker.observe({ kind: "context", platform: "jobkorea", context: handoffPosting }, handoffDetail())
  const firstLaunch = { ...launch, launchId: "00000000-0000-4000-8000-000000000011" }
  const secondLaunch = { ...launch, launchId: "00000000-0000-4000-8000-000000000012" }
  await tracker.observe(firstLaunch, handoffDetail())
  await tracker.observe(popupEntered, handoffPopup())
  await tracker.observe(firstLaunch, handoffDetail())
  expect((stored.submissionHandoffs as { targetTabId?: number }[])[0]?.targetTabId).toBe(9)
  await tracker.observe(secondLaunch, handoffDetail())
  await tracker.observe(popupEntered, handoffPopup(10))
  expect((await tracker.snapshot())[1]?.context).toMatchObject({ sourceJobId: handoffPublicId, internalGiNo: handoffGiNo })
})
