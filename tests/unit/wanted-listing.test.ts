import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DomPlatformAdapter } from "../../src/platforms/adapter"
import { PageLifecycle } from "../../src/platforms/page-lifecycle"
import { PostingWarnings } from "../../src/platforms/posting-warnings"
import { publicPostingProfileFor, wantedListingPostingProfile } from "../../src/platforms/public-postings"
import { defaultSettings } from "../../src/storage/settings"
import { record, fixtureProfile } from "../helpers"
import { wantedCard, wantedInspectedListing } from "../fixtures/wanted-inspected-listing"

const url = "https://www.wanted.co.kr/wdlist/518?country=kr&job_sort=job.latest_order"
let lifecycle: PageLifecycle | undefined
let warnings: PostingWarnings
beforeEach(() => {
  vi.spyOn(document, "URL", "get").mockReturnValue(url)
  document.body.innerHTML = wantedInspectedListing
  warnings = new PostingWarnings()
})
afterEach(() => {
  lifecycle?.dispose(); lifecycle = undefined; warnings.clear()
  vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML = ""
})

describe("원티드 목록 카드의 이전 지원 안내", () => {
  it("사람인의 (주)아인잡 지원을 원티드 아인잡(AINJOB) 카드에 다른 직무여도 표시한다", () => {
    document.body.innerHTML = `<ul data-cy="job-list">${wantedCard(325032, "아인잡(AINJOB)", "WEB Front 개발 리더 (3~5년)")}</ul>`
    const prior = record({ platform: "saramin", companyName: "(주)아인잡", normalizedCompanyName: "아인잡", jobTitle: "프론트엔드 개발자 (경력)", appliedAt: "2026-10-30", readStatus: "unknown" })
    const before = structuredClone(prior)
    const postings = new DomPlatformAdapter("wanted").extractJobPostings(document)
    expect(postings[0]).toMatchObject({ companyName: "아인잡(AINJOB)", sourceJobId: "325032" })
    expect(warnings.render(postings, [prior], defaultSettings, "listing").matches).toBe(1)
    const host = document.querySelector("todaystart-warning")!
    expect(host.parentElement).toBe(document.querySelector('[data-cy="job-card"]'))
    expect(host.closest("a,button")).toBeNull()
    expect(host.shadowRoot?.querySelector("summary")?.textContent).toContain("사람인 지원 이력 있음")
    expect(host.shadowRoot?.textContent).toContain("프론트엔드 개발자 (경력)")
    expect(host.shadowRoot?.textContent).toContain("2026-10-30")
    expect(prior).toEqual(before)
  })

  it.each(["/wdlist", "/wdlist/", "/wdlist/518", "/wdlist/518/669"])("목록 경로에서 사용자 제공 카드와 공개 공고 ID를 읽는다: %s", path => {
    const adapter = new DomPlatformAdapter("wanted")
    const location = `https://www.wanted.co.kr${path}`
    expect(adapter.isJobListingPage(location)).toBe(true)
    expect(publicPostingProfileFor("wanted", location)).toBe(wantedListingPostingProfile)
    const postings = adapter.extractJobPostings(document)
    expect(postings.map(({ companyName, jobTitle, sourceJobId, jobUrl }) => ({ companyName, jobTitle, sourceJobId, jobUrl }))).toEqual([
      { companyName: "미리디", jobTitle: "[커머스 플랫폼] QA 엔지니어", sourceJobId: "306913", jobUrl: "https://www.wanted.co.kr/wd/306913" },
      { companyName: "파이브레인에이아이", jobTitle: "AI Robot Engineer(S/W)", sourceJobId: "395998", jobUrl: "https://www.wanted.co.kr/wd/395998" },
      { companyName: "문토", jobTitle: "소프트웨어 엔지니어 (AI 캐릭터챗)|신사업 팀", sourceJobId: "395896", jobUrl: "https://www.wanted.co.kr/wd/395896" }
    ])
    expect(postings.every(posting => posting.element?.matches('[data-cy="job-card"]'))).toBe(true)
    expect(adapter.extractApplications(document)).toEqual([])
    expect(adapter.detectApplicationSuccess(document)).toBe(false)
  })

  it("CSS 해시가 바뀌어도 인식하고 다른 호스트·지원 현황·기업 페이지로 규칙을 넓히지 않는다", () => {
    document.querySelectorAll("[class]").forEach(element => element.className = "new-build-hash")
    expect(new DomPlatformAdapter("wanted").extractJobPostings(document)).toHaveLength(3)
    for (const location of ["http://www.wanted.co.kr/wdlist/518", "https://www.wanted.co.kr.evil.com/wdlist/518", "https://www.wanted.co.kr/company/2569", "https://www.wanted.co.kr/status/applications/applied", "https://www.wanted.co.kr/wdlisting"]) {
      expect(publicPostingProfileFor("wanted", location)).toBeUndefined()
    }
  })

  it("공개 공고 링크나 기업·직무가 없는 미완성 카드는 안내 대상으로 삼지 않는다", () => {
    const cards = document.querySelectorAll('[data-cy="job-card"]')
    cards[0]!.querySelector("a")!.setAttribute("href", "https://evil.com/wd/306913")
    cards[1]!.querySelector("button")!.removeAttribute("data-company-name")
    cards[2]!.querySelector("button")!.removeAttribute("data-position-name")
    expect(new DomPlatformAdapter("wanted").extractJobPostings(document)).toEqual([])
  })

  it("원티드·다른 경로의 완료 이력을 카드 안의 링크 바깥에 표시하고 중복 안내를 만들지 않는다", () => {
    const adapter = new DomPlatformAdapter("wanted", { ...fixtureProfile("saramin"), platform: "wanted", listingPaths: ["/wdlist"] })
    const records = [record({ platform: "wanted", companyName: "미리디", jobTitle: "이전 QA 직무", appliedAt: "2026-10-29", jobUrl: "https://www.wanted.co.kr/wd/100" }), record({ id: "other-source", companyName: "(주)미리디", jobTitle: "이전 프론트엔드 직무" }), record({ id: "pending", companyName: "문토", status: "pending_confirmation" }), record({ id: "cancelled", companyName: "파이브레인에이아이", status: "cancelled" })]
    const postings = adapter.extractJobPostings(document)
    expect(warnings.render(postings, records, defaultSettings, "listing").matches).toBe(1)
    const host = document.querySelector("todaystart-warning")!
    expect(host.parentElement).toBe(postings[0]!.element)
    expect(host.closest("a,button,ul")).toBe(document.querySelector("ul"))
    expect(host.shadowRoot?.querySelector("summary")?.textContent).toContain("원티드·사람인 지원 이력 있음")
    expect(host.shadowRoot?.querySelectorAll("article")).toHaveLength(2)
    expect(host.shadowRoot?.textContent).toContain("이전 QA 직무")
    expect(host.shadowRoot?.textContent).toContain("2026-10-29")
    const details = host.shadowRoot!.querySelector("details")!
    details.open = true
    warnings.render(adapter.extractJobPostings(document), records, defaultSettings, "listing")
    expect(document.querySelectorAll("todaystart-warning")).toHaveLength(1)
    expect(document.querySelector("todaystart-warning")).toBe(host)
    expect(details.open).toBe(true)
    warnings.render(postings, records, { ...defaultSettings, listingWarnings: false }, "listing")
    expect(document.querySelector("todaystart-warning")).toBeNull()
  })

  it("무한 스크롤 추가·늦은 속성 로딩·카드 재사용·목록 교체를 변경 감시로 처리한다", async () => {
    vi.useFakeTimers()
    const adapter = new DomPlatformAdapter("wanted")
    const records = [record({ platform: "wanted", companyName: "미리디", jobTitle: "이전 직무" })]
    const refresh = vi.fn(() => {
      warnings.render(adapter.extractJobPostings(document), records, defaultSettings, "listing")
      lifecycle!.observe(document.querySelector(wantedListingPostingProfile.root), false)
    })
    lifecycle = new PageLifecycle({ refresh, routeChanged: vi.fn(), popState: vi.fn(), discoveryDuration: () => 15000, needsRepair: () => warnings.needsRepair() })
    lifecycle.start(); refresh()
    const first = document.querySelector("todaystart-warning")!
    await vi.advanceTimersByTimeAsync(16000)
    document.querySelector("ul")!.insertAdjacentHTML("beforeend", wantedCard(353860, "미리디", "[미리캔버스] Product Engineer"))
    await vi.advanceTimersByTimeAsync(250)
    expect(document.querySelectorAll("todaystart-warning")).toHaveLength(2)
    expect(document.querySelector("todaystart-warning")).toBe(first)
    const appended = document.querySelectorAll('[data-cy="job-card"]')[3]!
    appended.querySelector("button")!.setAttribute("data-company-name", "다른 기업")
    await vi.advanceTimersByTimeAsync(250)
    expect(document.querySelectorAll("todaystart-warning")).toHaveLength(1)
    appended.querySelector("button")!.setAttribute("data-company-name", "미리디")
    await vi.advanceTimersByTimeAsync(250)
    expect(document.querySelectorAll("todaystart-warning")).toHaveLength(2)
    const scans = refresh.mock.calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).toHaveBeenCalledTimes(scans)
    const replacement = document.createElement("ul")
    replacement.dataset.cy = "job-list"
    replacement.innerHTML = wantedCard(374007, "미리디", "새 목록 공고")
    document.querySelector("ul")!.replaceWith(replacement)
    await vi.advanceTimersByTimeAsync(250)
    expect(document.querySelectorAll("todaystart-warning")).toHaveLength(1)
    expect(document.querySelector("todaystart-warning")).not.toBe(first)
    lifecycle.dispose()
  })
})
