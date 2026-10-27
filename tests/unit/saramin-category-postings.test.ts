import { expect, it } from "vitest"
import { DomPlatformAdapter } from "../../src/platforms/adapter"
import { publicPostingProfileFor } from "../../src/platforms/public-postings"
import { CompanyMatcher } from "../../src/core/company"
import { fixture, fixtureProfile, record } from "../helpers"

const listingUrl = "https://www.saramin.co.kr/zf_user/jobs/list/job-category?cat_kewd=84"
function documentFor(html = fixture("saramin-category-postings.html"), url = listingUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html")
  Object.defineProperty(doc, "URL", { value: url })
  return doc
}

it("reads category rows and curated cards independently, including companies without links", () => {
  const adapter = new DomPlatformAdapter("saramin")
  expect(adapter.isJobListingPage(listingUrl)).toBe(true)
  const postings = adapter.extractJobPostings(documentFor())
  expect(postings.map(p => [p.companyName, p.sourceJobId, p.element?.tagName])).toEqual([
    ["라프린의원", "55378329", "DIV"],
    ["넛지헬스케어(주)", "55378653", "DIV"],
    ["(주)빅링크에이아이", "55277162", "DIV"],
    ["넛지헬스케어(주)", "55378653", "LI"],
    ["(주)티피씨", "55177100", "LI"],
    ["(주)이지스벤처스", "55345644", "DIV"]
  ])
  expect(postings[1]!.jobTitle).toBe("[캐시워크] iOS개발 채용전환형 인턴")
  expect(postings[1]!.jobUrl).toBe("https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55378653")
  expect(postings.every(p => !p.element?.matches("a"))).toBe(true)
})

it("matches prior applications across sites without matching group names or visited markers", () => {
  const postings = new DomPlatformAdapter("saramin").extractJobPostings(documentFor())
  for (const platform of ["saramin", "jobkorea", "wanted", "remember", "manual"] as const) {
    const prior = record({ platform, companyName: "(주)넛지헬스케어", jobTitle: "이전 지원 직무" })
    expect(postings.filter(p => new CompanyMatcher([prior]).find(p).length).map(p => p.sourceJobId)).toEqual(["55378653", "55378653"])
    expect(postings.filter(p => new CompanyMatcher([{ ...prior, status: "cancelled" }]).find(p).length)).toHaveLength(0)
  }
  expect(postings.filter(p => new CompanyMatcher([record({ companyName: "넛지홀딩스그룹" })]).find(p).length)).toHaveLength(0)
})

it("uses category selectors when saved selectors cannot read the supplied layout", () => {
  const profile = { ...fixtureProfile("saramin"), listingPaths: ["/zf_user/jobs/list"] }
  expect(new DomPlatformAdapter("saramin", profile).extractJobPostings(documentFor())).toHaveLength(6)
})

it("limits the profile to registered Saramin listing routes and valid posting links", () => {
  for (const path of ["/zf_user/jobs/list", "/zf_user/jobs/list/", "/zf_user/jobs/list/job-category", "/zf_user/jobs/list/area"]) {
    expect(publicPostingProfileFor("saramin", "https://www.saramin.co.kr" + path)).toBeDefined()
  }
  for (const url of ["https://www.saramin.co.kr/zf_user/jobs/listings", "https://www.saramin.co.kr/zf_user/unverified", "https://www.saramin.co.kr.evil.example/zf_user/jobs/list", "http://www.saramin.co.kr/zf_user/jobs/list"]) {
    expect(publicPostingProfileFor("saramin", url)).toBeUndefined()
  }
  const html = fixture("saramin-category-postings.html").replaceAll("/zf_user/jobs/relay/view?", "https://evil.example/jobs?")
  expect(new DomPlatformAdapter("saramin").extractJobPostings(documentFor(html))).toHaveLength(0)
})
