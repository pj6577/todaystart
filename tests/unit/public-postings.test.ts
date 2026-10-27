import { describe, expect, it } from "vitest"
import { DomPlatformAdapter } from "../../src/platforms/adapter"
import { publicPostingPages, publicPostingProfileFor } from "../../src/platforms/public-postings"
import { fixture, fixtureProfile } from "../helpers"
import metadata from "../fixtures/public/metadata.json"
import searchPage5 from "../fixtures/public/jobkoreaSearchPage5.json"

describe("공개 사이트에서 확인한 공고 DOM", () => {
  for (const id of Object.keys(publicPostingPages) as (keyof typeof publicPostingPages)[]) {
    it(`${id}: 별도 이력 Profile 없이 실제 캡처 HTML에서 공고를 추출한다`, () => {
      const source = metadata[id]
      const doc = new DOMParser().parseFromString(fixture(`public/${id}.html`), "text/html")
      Object.defineProperty(doc, "URL", { value: source.sourceUrl })
      const adapter = new DomPlatformAdapter(publicPostingPages[id].platform)
      const postings = adapter.extractJobPostings(doc)
      expect(postings).toHaveLength(source.capturedPostingCount)
      for (const [index, expected] of source.expected.entries()) {
        expect(postings[index]).toMatchObject(expected)
        expect(postings[index]?.element).toBeInstanceOf(Element)
      }
      // Public jobs do not make history collection or success detection verified.
      expect(adapter.collect(doc).code).toBe("selectors_unverified")
      expect(adapter.detectApplicationSuccess(doc)).toBe(false)
    })
  }
  it.each(["https://evil.com/recruit/joblist", "https://www.jobkorea.co.kr.evil.com/recruit/joblist", "https://www.jobkorea.co.kr/recruit/gi_read/invalid", "http://www.jobkorea.co.kr/recruit/joblist", "https://www.jobkorea.co.kr/Search/unverified", "https://evil.com/Search"])("미지원 URL에서는 공개 선택자를 사용하지 않는다: %s", url => {
    expect(publicPostingProfileFor("jobkorea", url)).toBeUndefined()
  })
  it("잡코리아 현재 검색 목록을 인식하고 카드마다 공고 ID를 유지한다", () => {
    const url = publicPostingPages.jobkoreaSearch.sourceUrl
    const doc = new DOMParser().parseFromString(fixture("public/jobkoreaSearch.html"), "text/html")
    Object.defineProperty(doc, "URL", { value: url })
    const adapter = new DomPlatformAdapter("jobkorea")
    expect(adapter.isJobListingPage(url)).toBe(true)
    const postings = adapter.extractJobPostings(doc)
    expect(postings).toHaveLength(2)
    expect(postings.map(posting => posting.sourceJobId)).toEqual(["50183259", "50182513"])
    expect(postings[0]!.element).not.toBe(postings[1]!.element)
    expect(postings[0]!.element?.getAttribute("data-sentry-component")).toBe("CardJob")
  })
  it("미확인 지원 제출 경로를 상세 공고로 추정하지 않는다", () => {
    expect(publicPostingProfileFor("saramin", "https://www.saramin.co.kr/zf_user/jobs/relay/apply")).toBeUndefined()
  })
  it.each(["jobkoreaSearch", "jobkoreaList", "saraminSearch", "saraminDetail"] as const)("끝 슬래시 유무와 관계없이 같은 공개 공고를 인식한다: %s", id => {
    const source = publicPostingPages[id]
    const url = new URL(source.sourceUrl)
    url.pathname = url.pathname.replace(/\/$/, "") + "/"
    const doc = new DOMParser().parseFromString(fixture(`public/${id}.html`), "text/html")
    Object.defineProperty(doc, "URL", { value: url.href })
    const adapter = new DomPlatformAdapter(source.platform)
    expect(adapter.postingProfile(url.href, doc)).toBe(source.profile)
    expect(adapter.extractJobPostings(doc)).toHaveLength(metadata[id].capturedPostingCount)
    url.pathname += "/"
    expect(publicPostingProfileFor(source.platform, url.href)).toBeUndefined()
    url.pathname = url.pathname.replace(/\/\/$/, "/unverified/")
    expect(publicPostingProfileFor(source.platform, url.href)).toBeUndefined()
  })
  it.each(["default", "unrelated-profile", "stale-profile"])("잡코리아 5페이지의 실제 카드 20개를 기존 설정과 함께 인식한다: %s", mode => {
    const doc = new DOMParser().parseFromString(fixture("public/jobkoreaSearchPage5.html"), "text/html")
    Object.defineProperty(doc, "URL", { value: searchPage5.sourceUrl })
    const profile = mode === "default" ? undefined : fixtureProfile("jobkorea")
    if (profile && mode === "stale-profile") profile.listingPaths.push("/Search")
    const adapter = new DomPlatformAdapter("jobkorea", profile)
    expect(adapter.isJobListingPage(doc.URL)).toBe(true)
    const postings = adapter.extractJobPostings(doc)
    expect(postings).toHaveLength(20)
    for (const [i, expected] of searchPage5.expected.entries()) expect(postings[i]).toMatchObject(expected)
  })
  it("공개 캡처에는 로그인 폼·스크립트·추적 데이터가 없다", () => {
    for (const id of Object.keys(publicPostingPages)) {
      expect(fixture(`public/${id}.html`)).not.toMatch(/<script|<input|<iframe|\bonclick=|search_uuid|data-info=|data-brazeinfo=/i)
    }
  })
})
