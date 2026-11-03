import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useJobSearch } from "../../src/ui/use-job-search"
import { JobSearch } from "../../src/ui/job-search"
import { defaultSearchFilters } from "../../src/search/filters"
import { saveSearchPreferences } from "../../src/search/preferences"
import { readSearchBookmarks, syncSearchBookmarkGeneration } from "../../src/search/bookmarks"
import { record } from "../helpers"

vi.mock("../../src/ui/components", () => ({ Icon: () => null }))
vi.mock("../../src/ui/platform-logo", () => ({ PlatformSymbol: () => null }))
let root: Root, host: HTMLDivElement, search: ReturnType<typeof useJobSearch>
const filters = { ...defaultSearchFilters, role: ["frontend"] as const, region: ["seoul"] as const }
const response = (page: number, status = 200) => new Response(JSON.stringify({ data: [page].map(id => ({
  id, title: `공고 ${id}`, organization: { name: `기업 ${id}` }, status: "published", min_experience: 0, max_experience: 3
})), meta: { page, total_pages: 2 } }), { status })
function Harness() { search = useJobSearch(); return null }
async function run(action: () => void = () => {}) { await act(async () => { action(); await new Promise(resolve => setTimeout(resolve, 0)) }) }
beforeEach(async () => {
  const stored = new Map<string, string>()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key), key: (index: number) => [...stored.keys()][index] ?? null, get length() { return stored.size } })
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} })
  syncSearchBookmarkGeneration("workspace")
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await run(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

it("다음 페이지에 검색어·조건을 유지하고 실패 재시도와 새 검색에서 페이지를 정확히 갱신한다", async () => {
  let fail = true
  const calls: { page: number; search: unknown }[] = []
  vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => {
    const body = JSON.parse(init.body as string); calls.push(body)
    return response(body.page, fail && body.page === 2 ? 429 : 200)
  }))
  await run(() => root.render(React.createElement(Harness)))
  await run(() => search.search({ query: "React", filters }, ["remember"]))
  expect(search.sites[0]).toMatchObject({ platform: "remember", status: "ok", page: 1, hasNext: true })
  await run(() => search.loadMore("remember"))
  expect(search.feed.map(job => job.id)).toEqual(["remember:1"])
  expect(search.sites[0]).toMatchObject({ status: "blocked", page: 1, requestedPage: 2 })
  fail = false
  await run(() => search.retry(search.sites[0]!))
  expect(search.feed.map(job => job.id)).toEqual(["remember:1", "remember:2"])
  expect(search.sites[0]).toMatchObject({ page: 2, hasNext: false })
  expect(calls.map(call => call.page)).toEqual([1, 2, 2])
  expect(calls.every(call => JSON.stringify(call.search) === JSON.stringify(calls[0]!.search))).toBe(true)
  await run(() => search.search({ query: "Vue", filters }, ["remember"]))
  expect(search.feed.map(job => job.id)).toEqual(["remember:1"])
  expect(calls.at(-1)).toMatchObject({ page: 1, search: { keywords: ["Vue"] } })
})

it("리멤버 결과 필터·지원 이력·이력 오른쪽 북마크와 저장 목록을 기존 카드에 연결한다", async () => {
  const fetcher = vi.fn(async () => response(1))
  vi.stubGlobal("fetch", fetcher)
  saveSearchPreferences({ query: "React", filters, sites: ["remember"], excludeApplied: false })
  await run(() => root.render(React.createElement(JobSearch, { records: [record({ companyName: "㈜기업 1", platform: "jobkorea" })], generation: "workspace" })))
  await run(() => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
  expect(host.querySelector('[data-search-platform="remember"]')?.textContent).toBe("리멤버")
  const actions = host.querySelector(".job-search-card-actions")!
  expect(actions.children[0]!.textContent).toContain("지원 이력 있음")
  const bookmark = actions.children[1] as HTMLButtonElement
  await run(() => bookmark.click())
  expect(readSearchBookmarks("workspace")[0]!.job.id).toBe("remember:1")
  expect(bookmark.getAttribute("aria-pressed")).toBe("true")
  await run(() => host.querySelector<HTMLButtonElement>(".job-search-bookmarks-view")!.click())
  expect(host.querySelectorAll(".job-search-card")).toHaveLength(1)
  expect(host.querySelector('h3 a')!.getAttribute("href")).toBe("https://career.rememberapp.co.kr/job/posting/1")
  expect(fetcher).toHaveBeenCalledTimes(1)
  await run(() => host.querySelector<HTMLInputElement>(".job-search-exclude input")!.click())
  expect(host.querySelectorAll(".job-search-card")).toHaveLength(0)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it("응답 도착 순서와 관계없이 각 조회 묶음을 사람인·잡코리아·원티드·리멤버 순으로 표시하고 다음 묶음은 맨 아래에 추가한다", async () => {
  const pending = new Map<string, () => void>()
  vi.stubGlobal("fetch", vi.fn(async (raw: string, init: RequestInit) => {
    const url = new URL(raw)
    const platform = url.hostname.includes("saramin") ? "saramin" : url.hostname.includes("jobkorea") ? "jobkorea" : url.hostname.includes("wanted") ? "wanted" : "remember"
    const page = platform === "remember" ? JSON.parse(init.body as string).page : platform === "wanted" ? Number(url.searchParams.get("offset")) / 12 + 1 : Number(url.searchParams.get(platform === "saramin" ? "recruitPage" : "Page_No"))
    if (page === 1) await new Promise<void>(resolve => pending.set(platform, resolve))
    if (platform === "remember") return response(page)
    if (platform === "wanted") return new Response(JSON.stringify({ data: [{ id: page, position: `공고 ${page}`, company: { name: "원티드 기업" } }], links: { next: page === 1 ? "/next" : null } }))
    if (platform === "jobkorea") return new Response('<main><div data-sentry-component="CardJob"><a href="/Recruit/GI_Read/1"><span>잡코리아 기업</span></a><a data-sentry-component="Title" href="/Recruit/GI_Read/1"><span>공고 1</span></a></div></main>')
    return new Response(`<main id="recruit_info_list"><div class="item_recruit"><div class="area_corp"><span class="corp_name"><a>사람인 기업</a></span></div><div class="area_job"><h2 class="job_tit"><a href="/zf_user/jobs/relay/view?rec_idx=${page}">공고 ${page}</a></h2></div></div>${page === 1 ? '<div class="pagination"><a page="2">2</a></div>' : ''}</main>`)
  }))
  saveSearchPreferences({ query: "React", filters: defaultSearchFilters, sites: ["remember", "wanted", "jobkorea", "saramin"], excludeApplied: false })
  await run(() => root.render(React.createElement(JobSearch, { records: [], generation: "workspace" })))
  await run(() => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
  const links = () => [...host.querySelectorAll<HTMLAnchorElement>(".job-search-card h3 a")].map(link => new URL(link.href).hostname)
  for (const platform of ["remember", "wanted", "jobkorea", "saramin"]) await run(() => pending.get(platform)!())
  expect(links()).toEqual(["www.saramin.co.kr", "www.jobkorea.co.kr", "www.wanted.co.kr", "career.rememberapp.co.kr"])
  await run(() => [...host.querySelectorAll("button")].find(button => button.textContent === "다음 공고 가져오기")!.click())
  expect(links()).toEqual(["www.saramin.co.kr", "www.jobkorea.co.kr", "www.wanted.co.kr", "career.rememberapp.co.kr", "www.saramin.co.kr", "www.wanted.co.kr", "career.rememberapp.co.kr"])
  const wanted = host.querySelector<HTMLButtonElement>('[data-search-platform="wanted"]')!
  await run(() => wanted.click())
  expect(links()).toEqual(["www.wanted.co.kr", "www.wanted.co.kr"])
})
