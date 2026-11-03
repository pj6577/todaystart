import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { JobSearch } from "../../src/ui/job-search"
import { defaultSearchPreferences, saveSearchPreferences } from "../../src/search/preferences"
import { searchPlatforms, type SearchPlatform, type SiteSearchResult } from "../../src/search/model"

const mocked = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock("../../src/search/client", () => ({ requestSearchPage: mocked.request }))
vi.mock("../../src/ui/components", () => ({ Icon: () => null }))
vi.mock("../../src/ui/platform-logo", () => ({ PlatformSymbol: () => null }))
let root: Root, host: HTMLDivElement, observer: IntersectionObserverCallback, sentinel: Element
const cards = () => [...host.querySelectorAll(".job-search-card h3")].map(card => card.textContent)
const expected = (page: number, platforms: readonly SearchPlatform[] = searchPlatforms) => platforms.map(platform => `${platform} ${page}`)
const button = (label: string) => [...host.querySelectorAll("button")].find(button => button.textContent === label)!
const result = (platform: SearchPlatform, page: number, next = false): SiteSearchResult => ({ platform, page, searchUrl: "https://example.test/search", status: "ok", hasNext: next,
  jobs: [{ id: `${platform}:${page}`, platform, companyName: `${platform} 기업`, jobTitle: `${platform} ${page}`, jobUrl: "https://example.test/job" }] })
async function run(action: () => void = () => {}) { await act(async () => { action(); await new Promise(resolve => setTimeout(resolve, 0)) }) }
async function start() {
  await run(() => root.render(React.createElement(JobSearch, { records: [] })))
  await run(() => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
}
async function nearEnd() { await run(() => observer([{ target: sentinel, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)) }
beforeEach(() => {
  const stored = new Map<string, string>()
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value) } })
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: IntersectionObserverCallback) { observer = callback } observe(target: Element) { sentinel = target } disconnect() {} })
  saveSearchPreferences({ ...defaultSearchPreferences(), query: "React" })
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
  mocked.request.mockReset()
})
afterEach(async () => { await run(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

it("자동 다음 조회에서 리멤버가 먼저 도착해도 네 플랫폼을 모아 맨 아래에 붙이고 기존 카드 위치를 유지한다", async () => {
  const pending = new Map<SearchPlatform, () => void>()
  mocked.request.mockImplementation((platform: SearchPlatform, _query: string, page: number) => page === 1 ? Promise.resolve(result(platform, 1, true)) :
    new Promise<SiteSearchResult>(resolve => pending.set(platform, () => resolve(result(platform, page)))))
  await start()
  const first = [...host.querySelectorAll(".job-search-card")]
  expect(cards()).toEqual(expected(1))
  await nearEnd()
  expect(mocked.request).toHaveBeenCalledTimes(8)
  await run(() => pending.get("remember")!())
  expect(cards()).toEqual(expected(1))
  expect(host.querySelector(".job-search-demo")!.getAttribute("aria-busy")).toBe("true")
  expect(button("다음 공고 가져오기")).toBeUndefined()
  for (const platform of ["wanted", "jobkorea", "saramin"] as const) await run(() => pending.get(platform)!())
  expect(cards()).toEqual([...expected(1), ...expected(2)])
  expect([...host.querySelectorAll(".job-search-card")].slice(0, 4)).toEqual(first)
  expect(mocked.request).toHaveBeenCalledTimes(8)
  expect(button("다음 공고 가져오기")).toBeUndefined()
})

it("수동 다음 조회와 연속 자동 조회가 페이지를 건너뛰거나 한 플랫폼만 조회하지 않는다", async () => {
  mocked.request.mockImplementation(async (platform: SearchPlatform, _query: string, page: number) => result(platform, page, page < 3))
  await start()
  await run(() => button("다음 공고 가져오기").click())
  expect(cards()).toEqual([...expected(1), ...expected(2)])
  await nearEnd()
  for (let tick = 0; tick < 3; tick++) await run()
  expect(cards()).toEqual([...expected(1), ...expected(2), ...expected(3)])
  for (const platform of searchPlatforms) expect(mocked.request.mock.calls.filter(call => call[0] === platform).map(call => call[2])).toEqual([1, 2, 3])
})

it("드래그로 변경한 플랫폼 우선순위는 이전 묶음과 다음 묶음에 각각 적용한다", async () => {
  mocked.request.mockImplementation(async (platform: SearchPlatform, _query: string, page: number) => result(platform, page, page < 2))
  await start()
  const wanted = host.querySelector<HTMLButtonElement>('[data-search-platform="wanted"]')!
  for (let index = 0; index < 2; index++) await run(() => wanted.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true, cancelable: true })))
  const priority: SearchPlatform[] = ["wanted", "saramin", "jobkorea", "remember"]
  expect(cards()).toEqual(expected(1, priority))
  expect(mocked.request).toHaveBeenCalledTimes(4)
  await nearEnd()
  expect(cards()).toEqual([...expected(1, priority), ...expected(2, priority)])
})

it("한 플랫폼의 실패와 재시도는 먼저 가져온 다음 묶음을 위로 옮기거나 잃지 않는다", async () => {
  let blocked = true
  mocked.request.mockImplementation(async (platform: SearchPlatform, _query: string, page: number) => platform === "saramin" && page === 2 && blocked ?
    { ...result(platform, page), status: "blocked", jobs: [], hasNext: false } : result(platform, page, page === 1))
  await start(); await nearEnd()
  const before = [...expected(1), ...expected(2, ["jobkorea", "wanted", "remember"])]
  expect(cards()).toEqual(before)
  blocked = false
  await run(() => button("다시 시도").click())
  expect(cards()).toEqual([...before, "saramin 2"])
  expect(mocked.request.mock.calls.filter(call => call[0] === "saramin").map(call => call[2])).toEqual([1, 2, 2])
})

it("중지한 미완료 묶음은 소비하지 않고 계속하기에서 같은 페이지를 다시 읽는다", async () => {
  let held = true
  const pending = new Map<SearchPlatform, () => void>()
  mocked.request.mockImplementation((platform: SearchPlatform, _query: string, page: number, signal: AbortSignal) => {
    if (page === 1 || !held) return Promise.resolve(result(platform, page, page === 1))
    return new Promise<SiteSearchResult>(resolve => {
      pending.set(platform, () => resolve(result(platform, page)))
      signal.addEventListener("abort", () => resolve({ ...result(platform, page), jobs: [], status: "cancelled" }), { once: true })
    })
  })
  await start(); await nearEnd()
  await run(() => pending.get("remember")!())
  await run(() => button("검색 중지").click())
  expect(cards()).toEqual(expected(1))
  held = false
  await run(() => button("검색 계속하기").click())
  expect(cards()).toEqual([...expected(1), ...expected(2)])
  for (const platform of searchPlatforms) expect(mocked.request.mock.calls.filter(call => call[0] === platform).map(call => call[2])).toEqual([1, 2, 2])
})

it("페이지에 반복된 공고는 기존 위치에서 갱신하고 새 공고만 아래에 추가한다", async () => {
  mocked.request.mockImplementation(async (platform: SearchPlatform, _query: string, page: number) => {
    const next = result(platform, page, page === 1)
    return page === 2 ? { ...next, jobs: [{ ...result(platform, 1).jobs[0]!, jobTitle: `${platform} 1 갱신` }, ...next.jobs] } : next
  })
  await start(); await nearEnd()
  expect(cards()).toEqual([...searchPlatforms.map(platform => `${platform} 1 갱신`), ...expected(2)])
  expect(host.querySelectorAll(".job-search-card")).toHaveLength(8)
})
