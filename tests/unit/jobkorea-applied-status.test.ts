import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { jobkoreaAppliedDetail, jobkoreaDetailPosting } from "../../src/platforms/jobkorea-detail"
import { jobkoreaAppliedButton, jobkoreaAppliedDetailHtml, jobkoreaAppliedDetailUrl, jobkoreaAppliedHeader } from "../fixtures/jobkorea-applied-detail"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"
import { applicationIdentity } from "../../src/core/identity"
import { record } from "../helpers"
import { PageLifecycle } from "../../src/platforms/page-lifecycle"

let repository: ApplicationRepository
const posting = { sourceJobId: "50283630", companyName: "㈜이노가드", jobTitle: "[정규직]ERP 시스템 운영/개발", jobUrl: jobkoreaAppliedDetailUrl }
function page(html = jobkoreaAppliedDetailHtml, url = jobkoreaAppliedDetailUrl) {
  document.head.innerHTML = ""
  document.body.innerHTML = html
  Object.defineProperty(document, "URL", { configurable: true, value: url })
  return document
}
beforeEach(() => {
  repository = new ApplicationRepository(new TodayStartDatabase("applied-detail-" + crypto.randomUUID()))
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
})
afterEach(async () => { vi.useRealTimers(); await repository.db.delete(); document.body.innerHTML = ""; document.head.innerHTML = ""; delete (document as unknown as { URL?: string }).URL; vi.restoreAllMocks() })

it("사용자 제공 상세 구조의 기업·공고와 보이는 지원완료 버튼을 날짜 추정 없이 읽는다", () => {
  const doc = page()
  expect(jobkoreaAppliedDetail(doc)).toEqual({ ...posting, jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/50283630" })
  expect(jobkoreaDetailPosting(doc)).toMatchObject({ companyName: posting.companyName, jobTitle: posting.jobTitle, sourceJobId: posting.sourceJobId })
})
it.each([
  '<p>지원완료</p>', '<button>지원완료</button>',
  '<button data-sentry-component="ApplyButton">지원하기</button>',
  '<button data-sentry-component="ApplyButton">지원완료 후 확인</button>',
  '<button data-sentry-component="ApplyButton">지원이 완료되지 않았습니다</button>',
  `<div hidden>${jobkoreaAppliedButton}</div>`,
  `<div style="display:none">${jobkoreaAppliedButton}</div>`,
  `<div style="visibility:hidden">${jobkoreaAppliedButton}</div>`,
  `<div aria-hidden="true">${jobkoreaAppliedButton}</div>`,
  `<div data-sentry-component="CardJob">${jobkoreaAppliedButton}</div>`,
  `${jobkoreaAppliedButton}<button data-sentry-component="ApplyButton">지원하기</button>`
])("일반 문구·지원 전·실패·숨긴 버튼·추천·상충 상태는 저장 근거로 쓰지 않는다: %s", html => {
  expect(jobkoreaAppliedDetail(page(`<main>${jobkoreaAppliedHeader}${html}</main>`))).toBeUndefined()
})
it.each([
  "https://www.jobkorea.co.kr/Search/?gno=50283630",
  "https://www.jobkorea.co.kr/Recruit/OnPass?gno=50283630",
  "https://www.jobkorea.co.kr/Recruit/GI_Read/50283630/other",
  "https://www.jobkorea.co.kr.evil.example/Recruit/GI_Read/50283630"
])("정확한 잡코리아 상세 주소에서만 읽는다: %s", url => expect(jobkoreaAppliedDetail(page(undefined, url))).toBeUndefined())

it("회사 링크·제목이 없거나 헤더가 상충하거나 canonical이 다른 공고면 읽지 않는다", () => {
  expect(jobkoreaAppliedDetail(page(jobkoreaAppliedDetailHtml.replace('href="https://www.jobkorea.co.kr/Recruit/Co_Read/C/53782"', 'href="https://evil.example/company"')))).toBeUndefined()
  expect(jobkoreaAppliedDetail(page(jobkoreaAppliedDetailHtml.replace(/<h1>.*?<\/h1>/, "")))).toBeUndefined()
  expect(jobkoreaAppliedDetail(page(`<main>${jobkoreaAppliedHeader}${jobkoreaAppliedHeader.replace("이노가드", "다른회사")}${jobkoreaAppliedButton}</main>`))).toBeUndefined()
  const doc = page()
  doc.head.innerHTML = '<link rel="canonical" href="https://www.jobkorea.co.kr/Recruit/GI_Read/999">'
  expect(jobkoreaAppliedDetail(doc)).toBeUndefined()
})
it("지원완료 버튼이 늦게 나타나거나 기존 버튼 문구가 바뀌면 다시 읽는다", () => {
  const doc = page(`<main>${jobkoreaAppliedHeader}</main>`)
  expect(jobkoreaAppliedDetail(doc)).toBeUndefined()
  doc.querySelector("main")!.insertAdjacentHTML("beforeend", jobkoreaAppliedButton.replace("지원완료", "지원하기"))
  expect(jobkoreaAppliedDetail(doc)).toBeUndefined()
  doc.querySelector("button span span")!.textContent = "지원 완료"
  expect(jobkoreaAppliedDetail(doc)).toBeDefined()
  doc.querySelector("button")!.setAttribute("disabled", "")
  expect(jobkoreaAppliedDetail(doc)).toBeDefined()
})
it("초기 발견 시간이 지난 뒤 헤더 바깥 버튼이 지원완료로 바뀌어도 main 관찰로 다시 읽는다", async () => {
  vi.useFakeTimers()
  const doc = page(jobkoreaAppliedDetailHtml.replace("지원완료", "지원하기"))
  const refresh = vi.fn(() => jobkoreaAppliedDetail(doc))
  const lifecycle = new PageLifecycle({ refresh, routeChanged: vi.fn(), popState: vi.fn(), discoveryDuration: () => 15000, needsRepair: () => false })
  try {
    lifecycle.start(); lifecycle.observe(doc.querySelector("main"), false)
    await vi.advanceTimersByTimeAsync(16000)
    doc.querySelector("aside button span span")!.textContent = "지원완료"
    await Promise.resolve(); await vi.advanceTimersByTimeAsync(200)
    expect(refresh).toHaveBeenCalled()
    expect(refresh.mock.results.at(-1)!.value).toMatchObject({ sourceJobId: "50283630", companyName: "㈜이노가드" })
  } finally { lifecycle.dispose() }
})

it("동일 페이지 반복 관찰·동시 저장에도 기업 기록은 한 번 추가하고 실제 지원일을 만들지 않는다", async () => {
  expect(await Promise.all([repository.addJobkoreaAppliedStatus(posting), repository.addJobkoreaAppliedStatus(posting)])).toEqual([{ inserted: 1, updated: 0 }, { inserted: 0, updated: 0 }])
  const saved = (await repository.list())[0]!
  expect(saved).toMatchObject({ platform: "jobkorea", status: "applied", evidence: "detail_status", sourceJobId: "50283630", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/50283630" })
  expect(saved.appliedAt).toBeUndefined(); expect(saved.sourceApplicationId).toBeUndefined(); expect(saved.appliedAtTime).toBeUndefined()
  expect(applicationIdentity(saved)).toBe(saved.id)
  expect(await repository.addJobkoreaAppliedStatus({ ...posting, sourceJobId: "123", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/123" })).toEqual({ inserted: 0, updated: 0 })
})
it.each(["applied", "cancelled", "pending_confirmation", "unknown"] as const)("다른 경로에 같은 기업이 %s로 있으면 덮어쓰거나 추가하지 않는다", async status => {
  const existing = record({ platform: "manual", companyName: "이노 가드 주식회사", status })
  await repository.merge([existing])
  const before = await repository.list()
  expect(await repository.addJobkoreaAppliedStatus(posting)).toEqual({ inserted: 0, updated: 0 })
  expect(await repository.list()).toEqual(before)
})
it("이름이 비슷할 뿐인 다른 기업은 추가를 막지 않는다", async () => {
  await repository.merge([record({ companyName: "이노가드홀딩스" })])
  expect((await repository.addJobkoreaAppliedStatus(posting)).inserted).toBe(1)
  expect(await repository.list()).toHaveLength(2)
})
it("이후 지원 현황의 실제 지원일·지원 ID를 한 기록으로 보강하고 메모 연결을 유지한다", async () => {
  await repository.addJobkoreaAppliedStatus(posting)
  const old = (await repository.list())[0]!, link = (await repository.plannerSnapshot()).links[0]!
  const note = await repository.saveNote({ id: crypto.randomUUID(), expectedRevision: 0, title: "기업 메모", body: "유지", pinned: false, checklist: [], linkId: link.id })
  const imported = record({ platform: "jobkorea", companyName: posting.companyName, jobTitle: posting.jobTitle, sourceJobId: posting.sourceJobId, sourceApplicationId: "actual-application", appliedAt: "2026-10-20", jobUrl: posting.jobUrl })
  expect(await repository.merge([imported])).toEqual({ inserted: 0, updated: 1 })
  expect(await repository.list()).toMatchObject([{ id: imported.id, evidence: "history_page", appliedAt: "2026-10-20", sourceApplicationId: "actual-application", collectedAt: old.collectedAt }])
  const planner = await repository.plannerSnapshot()
  expect(planner.links).toHaveLength(1); expect(planner.links[0]!.recordId).toBe(imported.id)
  expect(planner.notes[0]).toMatchObject({ id: note.id, body: "유지", linkId: link.id })
  expect(planner.links[0]!.aliases).toContain(old.id)
})
it("여러 실제 지원이 함께 나오면 날짜 미확인 기록을 임의의 한 지원으로 합치지 않는다", async () => {
  await repository.addJobkoreaAppliedStatus(posting)
  await repository.merge(["2026-10-20", "2026-10-21"].map(appliedAt => record({ platform: "jobkorea", companyName: posting.companyName, jobTitle: posting.jobTitle, sourceJobId: posting.sourceJobId, appliedAt })))
  expect(await repository.list()).toHaveLength(3)
})
it("날짜 미확인 상세 보완 기록도 백업과 반복 복원에서 한 건으로 유지한다", async () => {
  await repository.addJobkoreaAppliedStatus(posting)
  const backup = await repository.backup()
  await repository.clear(); await repository.restore(backup); await repository.restore(backup)
  expect(await repository.list()).toHaveLength(1)
  expect((await repository.list())[0]).toMatchObject({ evidence: "detail_status", sourceJobId: posting.sourceJobId })
  expect((await repository.list())[0]!.appliedAt).toBeUndefined()
})
