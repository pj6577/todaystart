import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { applicationPage } from "../../src/submission/model"
import { SubmissionTracker } from "../../src/submission/tracker"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"

const jobId = "392849"
const posting = { sourceJobId: jobId, companyName: "가상 원티드 기업", jobTitle: "프론트엔드 개발자", jobUrl: `https://www.wanted.co.kr/wd/${jobId}` }
const sender = (result = false, tabId = 1, frameId = 0): chrome.runtime.MessageSender => ({ id: "test", url: posting.jobUrl + (result ? "/applied" : ""), frameId, tab: { id: tabId } as chrome.tabs.Tab, documentId: result ? "new-result-document" : "posting-document" })
const clicked = { kind: "apply_clicked" as const, platform: "wanted" as const, sourceJobId: jobId }
const completed = { kind: "wanted_completed" as const, platform: "wanted" as const, sourceJobId: jobId }
let repository: ApplicationRepository, tracker: SubmissionTracker, stored: Record<string, unknown>

beforeEach(() => {
  stored = {}
  vi.stubGlobal("chrome", { storage: { local: {
    get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(stored[key])])),
    set: async (values: Record<string, unknown>) => Object.assign(stored, structuredClone(values))
  } } })
  repository = new ApplicationRepository(new TodayStartDatabase("wanted-submission-" + crypto.randomUUID()))
  tracker = new SubmissionTracker(repository)
})
afterEach(async () => { await repository.db.delete(); vi.unstubAllGlobals() })
async function metadata() { await tracker.observe({ kind: "context", platform: "wanted", context: posting }, sender()) }

it("원티드 상세와 정확한 /applied 완료 경로를 구분한다", () => {
  expect(applicationPage(posting.jobUrl)).toMatchObject({ platform: "wanted", jobId, result: false })
  expect(applicationPage(posting.jobUrl + "/applied")).toMatchObject({ platform: "wanted", jobId, result: true })
  for (const url of [posting.jobUrl + "/applied/other", posting.jobUrl.replace("www.wanted.co.kr", "example.com") + "/applied", "https://www.wanted.co.kr/status/applications/applied"]) expect(applicationPage(url)).toBeUndefined()
})
it("모달 진입과 최종 클릭만으로는 지원 완료 기록을 만들지 않는다", async () => {
  await metadata()
  await tracker.observe({ kind: "entered", platform: "wanted", sourceJobId: jobId }, sender())
  expect((await tracker.snapshot())[0]?.stage).toBe("started")
  await tracker.observe(clicked, sender())
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "submitting", context: posting })
  expect(await repository.list()).toHaveLength(0)
})
it("같은 공고 완료 경로는 새 문서·워커 재시작 뒤에도 제출을 한 건의 완료로 기록한다", async () => {
  await metadata(); await tracker.observe(clicked, sender())
  tracker = new SubmissionTracker(repository)
  expect(await tracker.observe(completed, sender(true))).toBe(true)
  await tracker.observe(completed, sender(true))
  const records = await repository.list()
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ platform: "wanted", sourceJobId: jobId, status: "applied", submissionStage: "confirmed", evidence: "success_page", jobUrl: posting.jobUrl })
  expect(records[0]?.sourceApplicationId).toBeUndefined()
  expect(records[0]?.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(records[0]?.appliedAtTime).toBe((await tracker.snapshot())[0]?.clickedAt)
})
it("persists metadata and final click together even without a preceding modal-entry message", async () => {
  await tracker.observe({ kind: "wanted_submit", platform: "wanted", context: posting }, sender())
  expect(await repository.list()).toHaveLength(0)
  expect((await tracker.snapshot())[0]).toMatchObject({ stage: "submitting", context: posting })
  expect(await tracker.observe(completed, sender(true))).toBe(true)
  expect((await repository.list())[0]).toMatchObject({ companyName: posting.companyName, status: "applied", sourceJobId: jobId })
})
it("완료 주소를 직접 열거나 모달만 연 상태에서는 새 완료로 세지 않는다", async () => {
  expect(await tracker.observe(completed, sender(true))).toBe(false)
  await metadata()
  await tracker.observe({ kind: "entered", platform: "wanted", sourceJobId: jobId }, sender())
  expect(await tracker.observe(completed, sender(true))).toBe(false)
  expect(await repository.list()).toHaveLength(0)
})
it("다른 공고·탭·프레임이나 제출 전 경로는 완료시키지 않는다", async () => {
  await metadata(); await tracker.observe(clicked, sender())
  expect(await tracker.observe(completed, sender(true, 2))).toBe(false)
  await expect(tracker.observe(completed, sender(true, 1, 2))).rejects.toThrow()
  await expect(tracker.observe(completed, sender())).rejects.toThrow()
  await expect(tracker.observe(completed, { ...sender(true), url: "https://www.wanted.co.kr/wd/99/applied" })).rejects.toThrow()
  expect(await repository.list()).toHaveLength(0)
})
