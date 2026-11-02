import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { JobSearch } from "../../src/ui/job-search"
import { saveSearchPreferences } from "../../src/search/preferences"
import { defaultSearchFilters } from "../../src/search/filters"
import { readSearchBookmarks, searchBookmarkPrefix, setSearchBookmark, syncSearchBookmarkGeneration } from "../../src/search/bookmarks"
import { record } from "../helpers"

vi.mock("../../src/ui/components", () => ({ Icon: () => null }))
vi.mock("../../src/ui/platform-logo", () => ({ PlatformSymbol: () => null }))
let root: Root, host: HTMLDivElement
const stored = new Map<string, string>()
const storage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value) },
  removeItem: (key: string) => { stored.delete(key) },
  key: (index: number) => [...stored.keys()][index] ?? null,
  get length() { return stored.size }
}
const records = [record({ companyName: "기업 1" })]
const savedJob = { id: "wanted:1", platform: "wanted" as const, companyName: "기업 1", jobTitle: "공고 1", jobUrl: "https://www.wanted.co.kr/wd/1" }
const render = (generation: string | undefined = "workspace", key = "search") => root.render(React.createElement(JobSearch, { records, generation, key }))
const bookmark = (id = 1) => host.querySelector<HTMLButtonElement>(`button[aria-label="기업 ${id} 공고 ${id} 북마크"]`)!
const viewButton = () => host.querySelector<HTMLButtonElement>(".job-search-bookmarks-view")!
async function run(action: () => void = () => {}) { await act(async () => { action(); await new Promise(resolve => setTimeout(resolve, 0)) }) }

beforeEach(async () => {
  stored.clear(); vi.stubGlobal("localStorage", storage); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} })
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [1, 2].map(id => ({ id, position: `공고 ${id}`, company: { name: `기업 ${id}` } })), links: { next: null } }))))
  syncSearchBookmarkGeneration("workspace")
  saveSearchPreferences({ query: "React", filters: defaultSearchFilters, sites: ["wanted"], excludeApplied: false })
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await run(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })
async function search() {
  await run(() => render())
  await run(() => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
  expect(host.querySelectorAll(".job-search-card")).toHaveLength(2)
}

it("배지 오른쪽과 이력 없는 카드에도 북마크를 제공하고 저장해도 이력 모달을 열지 않는다", async () => {
  await search()
  const actions = host.querySelector(".job-search-card-actions")!
  expect(actions.children[0]!.textContent).toContain("지원 이력 있음")
  expect(actions.children[1]).toBe(bookmark())
  expect(bookmark(2).closest(".job-search-card-actions")!.children).toHaveLength(1)
  await run(() => bookmark().click())
  expect(bookmark().getAttribute("aria-pressed")).toBe("true")
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(readSearchBookmarks("workspace")).toHaveLength(1)
  await run(() => bookmark().click())
  expect(bookmark().getAttribute("aria-pressed")).toBe("false")
  expect(readSearchBookmarks("workspace")).toHaveLength(0)
})

it("재진입 후 검색 없이 저장한 공고를 모아 보고 해제하며 불필요한 조회를 하지 않는다", async () => {
  await search()
  await run(() => bookmark().click())
  await run(() => render("workspace", "reopen"))
  expect(host.querySelectorAll(".job-search-card")).toHaveLength(0)
  expect(viewButton().textContent).toContain("1")
  await run(() => viewButton().click())
  expect(host.querySelectorAll(".job-search-card")).toHaveLength(1)
  expect(bookmark().getAttribute("aria-pressed")).toBe("true")
  expect(fetch).toHaveBeenCalledTimes(1)
  await run(() => bookmark().click())
  expect(host.querySelectorAll(".job-search-card")).toHaveLength(0)
  expect(host.textContent).toContain("북마크한 공고가 없어요")
  expect(fetch).toHaveBeenCalledTimes(1)
})

it("초기 로딩에서 이전 북마크를 지우지 않으며 다른 탭의 저장·해제를 반영한다", async () => {
  setSearchBookmark(savedJob, true, "workspace")
  await run(() => root.render(React.createElement(JobSearch, { records, generation: undefined })))
  expect(readSearchBookmarks("workspace")).toHaveLength(1)
  await run(() => render())
  await run(() => viewButton().click())
  expect(bookmark().getAttribute("aria-pressed")).toBe("true")
  stored.delete(searchBookmarkPrefix + "wanted:1")
  await run(() => window.dispatchEvent(new StorageEvent("storage", { key: searchBookmarkPrefix + "wanted:1" })))
  expect(host.querySelectorAll(".job-search-card")).toHaveLength(0)
})

it("저장이 실패하면 활성화하지 않고 오류를 알리며 기존 공고는 유지한다", async () => {
  await search()
  vi.spyOn(storage, "setItem").mockImplementationOnce(() => { throw new Error("quota") })
  await run(() => bookmark().click())
  expect(bookmark().getAttribute("aria-pressed")).toBe("false")
  expect(host.querySelector('[role="alert"]')!.textContent).toContain("북마크를 변경하지 못했어요")
  expect(host.querySelectorAll(".job-search-card")).toHaveLength(2)
  expect(readSearchBookmarks("workspace")).toHaveLength(0)
  vi.restoreAllMocks()
})

it("초기화 전의 오래된 검색 화면을 열어도 새로 저장된 북마크를 지우지 않는다", async () => {
  syncSearchBookmarkGeneration("reset")
  setSearchBookmark(savedJob, true, "reset")
  await run(() => render("workspace"))
  expect(readSearchBookmarks("reset")).toHaveLength(1)
  await run(() => render("reset"))
  await run(() => viewButton().click())
  expect(bookmark().getAttribute("aria-pressed")).toBe("true")
})
