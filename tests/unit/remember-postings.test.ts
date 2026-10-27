import { expect, it } from "vitest"
import { platformForUrl, safeJobUrl, jobIdFromUrl } from "../../src/core/urls"
import { platformHostPatterns } from "../../src/core/platforms"
import { DomPlatformAdapter } from "../../src/platforms/adapter"
import { isBuiltInHistoryUrl } from "../../src/platforms/history-pagination"
import { publicPostingProfileFor, rememberPostingProfile } from "../../src/platforms/public-postings"
import { fixture, record } from "../helpers"
import { CompanyMatcher } from "../../src/core/company"

const listingUrl = "https://career.rememberapp.co.kr/job/postings"
function documentFor(html = fixture("remember-postings.html"), url = listingUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html")
  Object.defineProperty(doc, "URL", { value: url })
  return doc
}

it("recognizes both Remember hosts but keeps history and listing routes separate", () => {
  const adapter = new DomPlatformAdapter("remember")
  for (const url of ["https://career.rememberapp.co.kr/job/postings", "https://career.rememberapp.co.kr/job/postings/?keyword=react"]) {
    expect(platformForUrl(url)).toBe("remember")
    expect(adapter.isJobListingPage(url)).toBe(true)
    expect(adapter.isApplicationHistoryPage(url)).toBe(false)
  }
  expect(adapter.isApplicationHistoryPage("https://profile.rememberapp.co.kr/applies")).toBe(true)
  expect(adapter.isJobListingPage("https://profile.rememberapp.co.kr/job/postings")).toBe(false)
  expect(isBuiltInHistoryUrl("https://career.rememberapp.co.kr/applies", "remember")).toBe(false)
  expect(adapter.isJobListingPage("https://career.rememberapp.co.kr/job/postings/123")).toBe(false)
  expect(platformHostPatterns).toContain("https://career.rememberapp.co.kr/*")
})
it("reads the supplied card without hashed classes, normalizes the job link and uses the outer card", () => {
  const adapter = new DomPlatformAdapter("remember")
  for (const html of [fixture("remember-postings.html"), fixture("remember-postings.html").replace(/class="[^"]*"/g, 'class="new-styles"')]) {
    const doc = documentFor(html), postings = adapter.extractJobPostings(doc)
    expect(postings).toHaveLength(1)
    expect(postings[0]).toMatchObject({ platform: "remember", companyName: "휴멜로(주)", jobTitle: "[Tikita] AI 프로덕트 엔지니어 (풀스택)", sourceJobId: "338684", jobUrl: "https://career.rememberapp.co.kr/job/posting/338684" })
    expect(postings[0]!.element?.tagName).toBe("DIV")
    expect(postings[0]!.element?.querySelector(":scope > a")).toBeTruthy()
    expect(adapter.extractApplications(doc)).toEqual([])
  }
})
it("matches companies from the same site and other sites regardless of the current role", () => {
  const posting = new DomPlatformAdapter("remember").extractJobPostings(documentFor())[0]!
  for (const platform of ["remember", "saramin", "jobkorea", "wanted", "manual"] as const) {
    const prior = record({ platform, companyName: "(주)휴멜로", jobTitle: "다른 지원 직무", appliedAt: "2026-10-14" })
    expect(new CompanyMatcher([prior]).find(posting)).toHaveLength(1)
    expect(new CompanyMatcher([{ ...prior, status: "cancelled" }]).find(posting)).toHaveLength(0)
    expect(new CompanyMatcher([{ ...prior, status: "cancelled" }], true).find(posting)).toHaveLength(1)
  }
})
it("requires the exact listing host and route, including trailing slash and query variants", () => {
  expect(publicPostingProfileFor("remember", listingUrl + "/?keyword=react")).toBe(rememberPostingProfile)
  for (const url of ["https://profile.rememberapp.co.kr/job/postings", listingUrl + "/unverified", listingUrl + "//", "https://career.rememberapp.co.kr/job/posting/338684", "https://career.rememberapp.co.kr/applies"]) {
    expect(publicPostingProfileFor("remember", url)).toBeUndefined()
  }
})
it("skips invalid or foreign posting links and never merges multiple linked cards", () => {
  const adapter = new DomPlatformAdapter("remember"), html = fixture("remember-postings.html")
  for (const link of ["https://evil.example/job/posting/338684", "/job/posting/invalid", "https://profile.rememberapp.co.kr/job/posting/338684"]) {
    expect(adapter.extractJobPostings(documentFor(html.replace('/job/posting/338684?', link + '?')))).toHaveLength(0)
  }
  const doc = documentFor(), card = doc.body.querySelector("div")!
  card.append(card.querySelector("a")!.cloneNode(true))
  expect(adapter.extractJobPostings(doc)).toHaveLength(0)
  expect(jobIdFromUrl("https://career.rememberapp.co.kr/job/posting/338684?tracking=PRIVATE")).toBe("338684")
  expect(jobIdFromUrl("https://career.rememberapp.co.kr/job/posting/338684?rec_idx=7")).toBe("338684")
  expect(jobIdFromUrl("https://profile.rememberapp.co.kr/job/posting/338684?rec_idx=7")).toBeUndefined()
  expect(safeJobUrl("https://career.rememberapp.co.kr/job/posting/338684?rec_idx=7", "remember")).toBe("https://career.rememberapp.co.kr/job/posting/338684")
})
it("accepts a clean career link without widening access to lookalike domains", () => {
  expect(safeJobUrl("https://career.rememberapp.co.kr/job/posting/123?token=PRIVATE#apply", "remember")).toBe("https://career.rememberapp.co.kr/job/posting/123")
  for (const url of ["http://career.rememberapp.co.kr/job/postings", "https://career.rememberapp.co.kr.evil.example/job/postings", "https://evil.rememberapp.co.kr/job/postings"]) {
    expect(platformForUrl(url)).toBeUndefined()
    expect(safeJobUrl(url, "remember")).toBeUndefined()
  }
})
