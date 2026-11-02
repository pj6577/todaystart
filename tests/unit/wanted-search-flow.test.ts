import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useJobSearch } from "../../src/ui/use-job-search"
import { defaultSearchFilters } from "../../src/search/filters"
import { JobSearch } from "../../src/ui/job-search"
import { saveSearchPreferences } from "../../src/search/preferences"

vi.mock("../../src/ui/components", () => ({ Icon: () => null }))
vi.mock("../../src/ui/platform-logo", () => ({ PlatformSymbol: () => null }))

let root: Root, host: HTMLDivElement, search: ReturnType<typeof useJobSearch>
const filters = { ...defaultSearchFilters, role: ["frontend"] as const, region: ["seoul"] as const }
const response = (ids: number[], next = false, status = 200) => new Response(JSON.stringify({
  data: ids.map(id => ({ id, position: `공고 ${id}`, company: { name: `기업 ${id}` } })), links: { next: next ? "/next" : null }
}), { status })
function Harness() { search = useJobSearch(); return null }
async function run(action: () => void) { await act(async () => { action(); await new Promise(resolve => setTimeout(resolve, 0)) }) }

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const stored = new Map<string, string>()
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) })
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
  await run(() => root.render(React.createElement(Harness)))
})
afterEach(async () => { await run(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

it("화면 훅이 다음 조회에 원티드 대조 상태를 유지하고 새 검색·초기화에서는 버린다", async () => {
  const calls: URL[] = []
  vi.stubGlobal("fetch", vi.fn(async (raw: string) => {
    const url = new URL(raw); calls.push(url)
    if (url.searchParams.get("query") === "Vue") return response([2])
    return url.pathname.includes("search/v1") ? response([30]) : response(url.searchParams.get("offset") === "0" ? [1] : [30], true)
  }))
  await run(() => search.search({ query: "React", filters }, ["wanted"]))
  expect(search.sites[0]).toMatchObject({ page: 1, matching: true, hasNext: true, status: "ok" })
  expect(search.feed).toEqual([])
  await run(() => search.loadMore("wanted"))
  expect(search.feed.map(job => job.id)).toEqual(["wanted:30"])
  expect(search.sites[0]).toMatchObject({ page: 2, hasNext: false })
  expect(calls).toHaveLength(3)
  expect(calls[2]!.searchParams.get("offset")).toBe("12")
  await run(() => search.search({ query: "Vue", filters }, ["wanted"]))
  expect(search.feed).toEqual([])
  expect(search.sites[0]).toMatchObject({ page: 1, hasNext: true, matching: true })
  expect(calls).toHaveLength(5)
  await run(() => search.clear())
  expect(search.feed).toEqual([]); expect(search.sites).toEqual([])
  await run(() => search.search({ query: "React", filters }, ["wanted"]))
  expect(calls).toHaveLength(7)
  expect(search.feed).toEqual([])
})

it("부분 실패 재시도가 같은 페이지를 다시 읽고 일치 공고를 잃지 않는다", async () => {
  let blocked = true
  const fetcher = vi.fn(async (raw: string) => response([1], false, raw.includes("navigation") && blocked ? 429 : 200))
  vi.stubGlobal("fetch", fetcher)
  await run(() => search.search({ query: "React", filters }, ["wanted"]))
  expect(search.sites[0]).toMatchObject({ page: 0, requestedPage: 1, status: "blocked" })
  expect(search.feed).toEqual([])
  blocked = false
  await run(() => search.retry(search.sites[0]!))
  expect(search.feed.map(job => job.id)).toEqual(["wanted:1"])
  expect(search.sites[0]).toMatchObject({ page: 1, status: "ok", hasNext: false })
  expect(fetcher).toHaveBeenCalledTimes(4)
})

it("중지한 다음 조회는 이전 대조 상태부터 이어가고 화면 종료 시 요청을 취소한다", async () => {
  let held = true, pendingSignal: AbortSignal | undefined
  vi.stubGlobal("fetch", vi.fn(async (raw: string, init: RequestInit) => {
    const url = new URL(raw)
    if (url.pathname.includes("search/v1")) return response([30])
    if (url.searchParams.get("offset") === "0") return response([1], true)
    if (!held) return response([30])
    pendingSignal = init.signal as AbortSignal
    return new Promise<Response>((_, reject) => pendingSignal!.addEventListener("abort", () => reject(new Error("aborted"))))
  }))
  await run(() => search.search({ query: "React", filters }, ["wanted"]))
  await run(() => search.loadMore("wanted"))
  expect(search.busy).toBe(true)
  await run(() => search.stop())
  expect(pendingSignal!.aborted).toBe(true)
  expect(search.paused).toBe(true)
  expect(search.sites[0]).toMatchObject({ page: 1, requestedPage: 2, status: "cancelled", hasNext: true })
  held = false
  await run(() => search.loadMore("wanted"))
  expect(search.feed.map(job => job.id)).toEqual(["wanted:30"])
  held = true
  await run(() => search.search({ query: "React", filters }, ["wanted"]))
  await run(() => search.loadMore("wanted"))
  const signal = pendingSignal!
  await run(() => root.unmount())
  expect(signal.aborted).toBe(true)
})

it("같은 필터 화면에서 검색어를 유지하며 빈 대조를 제한해서 이어 읽고 버튼으로 계속한다", async () => {
  let calls = 0
  vi.stubGlobal("fetch", vi.fn(async (raw: string) => {
    calls++
    const url = new URL(raw), offset = Number(url.searchParams.get("offset"))
    return response([offset + (url.pathname.includes("search/v1") ? 1 : 10001)], true)
  }))
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    disconnect() {}
  })
  saveSearchPreferences({ query: "React", filters, sites: ["wanted"], excludeApplied: false })
  await run(() => root.render(React.createElement(JobSearch, { records: [] })))
  await run(() => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
  for (let tick = 0; tick < 8; tick++) await run(() => {})
  expect(calls).toBe(8) // First pair plus at most three automatic continuation pairs.
  expect(host.textContent).not.toMatch(/미지원|연결 전|검색 결과가 없어요|검색어를 비워/)
  expect((host.querySelector('input[type="search"]') as HTMLInputElement).value).toBe("React")
  const next = [...host.querySelectorAll("button")].find(button => button.textContent === "다음 공고 가져오기")!
  expect(next.disabled).toBe(false)
  await run(() => next.click())
  for (let tick = 0; tick < 3; tick++) await run(() => {})
  expect(calls).toBe(10)
})
