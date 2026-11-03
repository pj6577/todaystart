import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { JobSearch } from "../../src/ui/job-search"
import { defaultSearchPreferences, readSearchPreferences, saveSearchPreferences } from "../../src/search/preferences"
import { searchPlatformOrderKey } from "../../src/search/platform-order"
import { searchPlatforms, type SearchJob } from "../../src/search/model"

const mocked = vi.hoisted(() => ({ useJobSearch: vi.fn() }))
vi.mock("../../src/ui/use-job-search", () => ({ useJobSearch: mocked.useJobSearch }))
vi.mock("../../src/ui/components", () => ({ Icon: () => null }))
vi.mock("../../src/ui/platform-logo", () => ({ PlatformSymbol: () => null }))
let root: Root, host: HTMLDivElement, underPointer: Element | null
const stored = new Map<string, string>(), capture = new Map<number, Element>()
const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value) },
  removeItem: (key: string) => { stored.delete(key) }, key: (index: number) => [...stored.keys()][index] ?? null, get length() { return stored.size } }
const jobs: SearchJob[] = ["remember", "wanted", "jobkorea", "saramin", "wanted"].map((platform, id) => ({
  id: `${platform}:${id + 1}`, platform: platform as SearchJob["platform"], companyName: `기업 ${id}`, jobTitle: `${platform} 공고 ${id}`,
  jobUrl: platform === "remember" ? `https://career.rememberapp.co.kr/job/posting/${id + 1}` : platform === "wanted" ? `https://www.wanted.co.kr/wd/${id + 1}` : platform === "jobkorea" ? `https://www.jobkorea.co.kr/Recruit/GI_Read/${id + 1}` : `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${id + 1}`
}))
const tab = (platform: string) => host.querySelector<HTMLButtonElement>(`[data-search-platform="${platform}"]`)!
const tabs = () => [...host.querySelectorAll<HTMLElement>("[data-search-platform]")].map(button => button.dataset.searchPlatform)
const cards = () => [...host.querySelectorAll(".job-search-card h3")].map(title => title.textContent)
async function run(action: () => void = () => {}) { await act(async () => { action(); await new Promise(resolve => setTimeout(resolve, 0)) }) }
function pointer(target: EventTarget, type: string, x: number, y: number, pointerId = 1, button = 0, pointerType = "mouse") {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button })
  Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true }, pointerType: { value: pointerType } })
  target.dispatchEvent(event)
}
const key = (platform: string, key: string) => tab(platform).dispatchEvent(new KeyboardEvent("keydown", { key, altKey: true, bubbles: true, cancelable: true }))
async function render() { await run(() => root.render(React.createElement(JobSearch, { records: [], generation: "workspace" }))) }
beforeEach(() => {
  stored.clear(); capture.clear(); underPointer = null
  vi.stubGlobal("localStorage", storage); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} })
  vi.stubGlobal("fetch", vi.fn())
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => underPointer })
  Object.defineProperty(Element.prototype, "setPointerCapture", { configurable: true, value(this: Element, id: number) { capture.set(id, this) } })
  Object.defineProperty(Element.prototype, "hasPointerCapture", { configurable: true, value(this: Element, id: number) { return capture.get(id) === this } })
  Object.defineProperty(Element.prototype, "releasePointerCapture", { configurable: true, value(id: number) { capture.delete(id) } })
  mocked.useJobSearch.mockReturnValue({ sites: searchPlatforms.map(platform => ({ platform, status: "ok", hasNext: false, page: 1 })), feed: jobs, batches: [jobs],
    paused: false, busy: false, moreSites: [], search: vi.fn(), stop: vi.fn(), clear: vi.fn(), retry: vi.fn(), loadMore: vi.fn() })
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await run(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  for (const name of ["setPointerCapture", "hasPointerCapture", "releasePointerCapture"]) Reflect.deleteProperty(Element.prototype, name)
  Reflect.deleteProperty(document, "elementFromPoint")
})

it.each(["mouse", "touch"])("%s 드래그는 전체를 고정하고 탭·전체 결과 순서를 함께 저장하며 필터 클릭을 발생시키지 않는다", async pointerType => {
  await render()
  const source = tab("remember")
  await run(() => pointer(source, "pointerdown", 400, 20, 1, 0, pointerType))
  underPointer = tab("saramin")
  await run(() => pointer(window, "pointermove", 100, 20, 1, 0, pointerType))
  expect(source.classList.contains("is-dragging")).toBe(true)
  expect(tab("saramin").dataset.dropSide).toBe("before")
  expect(tabs()).toEqual(["all", ...searchPlatforms]) // Only commit on drop.
  await run(() => pointer(window, "pointerup", 100, 20, 1, 0, pointerType))
  await run(() => source.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })))
  expect(tabs()).toEqual(["all", "remember", "saramin", "jobkorea", "wanted"])
  expect(tab("all").getAttribute("aria-pressed")).toBe("true")
  expect(cards()).toEqual(["remember 공고 0", "saramin 공고 3", "jobkorea 공고 2", "wanted 공고 1", "wanted 공고 4"])
  expect(JSON.parse(stored.get(searchPlatformOrderKey)!)).toEqual({ version: 1, platforms: ["remember", "saramin", "jobkorea", "wanted"] })
  expect(document.activeElement).toBe(source)
  expect(capture.size).toBe(0)
  expect(fetch).not.toHaveBeenCalled()
})

it("작은 포인터 움직임은 필터 클릭으로 처리하며 오른쪽 클릭·다른 포인터는 순서를 바꾸지 않는다", async () => {
  await render()
  const source = tab("wanted")
  await run(() => pointer(source, "pointerdown", 200, 20))
  underPointer = tab("saramin")
  await run(() => pointer(window, "pointermove", 203, 20))
  await run(() => pointer(window, "pointerup", 203, 20))
  await run(() => source.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })))
  expect(tab("wanted").getAttribute("aria-pressed")).toBe("true")
  expect(cards()).toEqual(["wanted 공고 1", "wanted 공고 4"])
  expect(stored.has(searchPlatformOrderKey)).toBe(false)
  await run(() => pointer(source, "pointerdown", 200, 20, 1, 2))
  await run(() => pointer(window, "pointermove", 100, 20))
  await run(() => pointer(window, "pointerup", 100, 20))
  expect(tabs()).toEqual(["all", ...searchPlatforms])
  await run(() => pointer(source, "pointerdown", 200, 20))
  await run(() => pointer(window, "pointermove", 100, 20, 2))
  await run(() => pointer(window, "pointerup", 100, 20, 2))
  expect(source.classList.contains("is-dragging")).toBe(false)
  await run(() => pointer(window, "pointercancel", 200, 20))
})

it.each(["escape", "pointercancel", "blur", "outside", "all"])("%s 취소는 순서를 저장하지 않고 클릭도 억제한다", async kind => {
  await render()
  const source = tab("wanted")
  await run(() => pointer(source, "pointerdown", 200, 20))
  underPointer = tab("saramin")
  await run(() => pointer(window, "pointermove", 100, 20))
  if (kind === "escape") await run(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })))
  else if (kind === "pointercancel") await run(() => pointer(window, "pointercancel", 100, 20))
  else if (kind === "blur") await run(() => window.dispatchEvent(new Event("blur")))
  else underPointer = kind === "all" ? tab("all") : null
  await run(() => pointer(window, "pointerup", 100, 20))
  await run(() => source.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })))
  expect(tabs()).toEqual(["all", ...searchPlatforms])
  expect(stored.has(searchPlatformOrderKey)).toBe(false)
  expect(tab("all").getAttribute("aria-pressed")).toBe("true")
  expect(source.classList.contains("is-dragging")).toBe(false)
  expect(capture.size).toBe(0)
})

it("키보드 이동은 필터·포커스·사이트 내부 순서를 유지하고 재진입 후 복원한다", async () => {
  saveSearchPreferences({ ...defaultSearchPreferences(), query: "React", sites: ["wanted", "saramin"] })
  const preferences = readSearchPreferences()
  await render()
  await run(() => tab("wanted").click())
  await run(() => key("wanted", "ArrowLeft"))
  await run(() => key("wanted", "ArrowLeft"))
  await run(() => key("wanted", "ArrowLeft")) // Already first: no wrap.
  expect(tabs()).toEqual(["all", "wanted", "saramin", "jobkorea", "remember"])
  expect(tab("wanted").getAttribute("aria-pressed")).toBe("true")
  expect(document.activeElement).toBe(tab("wanted"))
  expect(readSearchPreferences()).toEqual(preferences)
  await run(() => tab("all").click())
  expect(cards()).toEqual(["wanted 공고 1", "wanted 공고 4", "saramin 공고 3", "jobkorea 공고 2", "remember 공고 0"])
  await run(() => root.unmount()); root = createRoot(host)
  await render()
  expect(tabs()).toEqual(["all", "wanted", "saramin", "jobkorea", "remember"])
  expect(cards()).toEqual(["wanted 공고 1", "wanted 공고 4", "saramin 공고 3", "jobkorea 공고 2", "remember 공고 0"])
  expect(fetch).not.toHaveBeenCalled()
})

it("클릭 없이 취소된 드래그가 다음 전체 버튼 클릭을 삼키지 않는다", async () => {
  await render()
  await run(() => tab("wanted").click())
  await run(() => pointer(tab("remember"), "pointerdown", 400, 20))
  underPointer = tab("saramin")
  await run(() => pointer(window, "pointermove", 100, 20))
  await run(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })))
  await run(() => pointer(window, "pointerup", 100, 20))
  await run(() => pointer(tab("all"), "pointerdown", 10, 20))
  await run(() => pointer(window, "pointerup", 10, 20))
  await run(() => tab("all").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })))
  expect(tab("all").getAttribute("aria-pressed")).toBe("true")
  expect(host.querySelectorAll(".job-search-card")).toHaveLength(5)
  expect(stored.has(searchPlatformOrderKey)).toBe(false)
})

it("숨겨진 플랫폼도 저장 순서에 보존하고 같은 탭의 다른 데이터는 저장하지 않는다", async () => {
  const state = mocked.useJobSearch.getMockImplementation()!()
  mocked.useJobSearch.mockReturnValue({ ...state, sites: state.sites.filter((site: { platform: string }) => ["saramin", "wanted"].includes(site.platform)) })
  await render()
  expect(tabs()).toEqual(["all", "saramin", "wanted"])
  await run(() => key("wanted", "ArrowLeft"))
  expect(tabs()).toEqual(["all", "wanted", "saramin"])
  expect(JSON.parse(stored.get(searchPlatformOrderKey)!)).toEqual({ version: 1, platforms: ["wanted", "saramin", "jobkorea", "remember"] })
  expect([...stored.values()].join(" ")).not.toMatch(/企業|기업|공고|jobUrl/)
})

it("다른 창의 순서 변경은 반영하고 진행 중 드래그가 이를 덮어쓰지 않는다", async () => {
  await render()
  await run(() => pointer(tab("wanted"), "pointerdown", 200, 20))
  underPointer = tab("saramin")
  await run(() => pointer(window, "pointermove", 100, 20))
  const remote = ["remember", "wanted", "jobkorea", "saramin"]
  stored.set(searchPlatformOrderKey, JSON.stringify({ version: 1, platforms: remote }))
  await run(() => window.dispatchEvent(new StorageEvent("storage", { key: searchPlatformOrderKey })))
  await run(() => pointer(window, "pointerup", 100, 20))
  expect(tabs()).toEqual(["all", ...remote])
  expect(JSON.parse(stored.get(searchPlatformOrderKey)!).platforms).toEqual(remote)
  stored.delete(searchPlatformOrderKey)
  await run(() => window.dispatchEvent(new StorageEvent("storage", { key: searchPlatformOrderKey })))
  expect(tabs()).toEqual(["all", ...searchPlatforms])
})

it("저장 실패는 표시하고 다음 성공 시 해제하며 종료한 드래그는 남은 이벤트로 저장하지 않는다", async () => {
  await render()
  vi.spyOn(storage, "setItem").mockImplementationOnce(() => { throw Error("quota") })
  await run(() => key("wanted", "ArrowLeft"))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("저장하지 못했어요")
  expect(tabs()).toEqual(["all", "saramin", "wanted", "jobkorea", "remember"])
  await run(() => key("wanted", "ArrowLeft"))
  expect(host.querySelector('[role="alert"]')).toBeNull()
  const before = stored.get(searchPlatformOrderKey)
  await run(() => pointer(tab("remember"), "pointerdown", 400, 20))
  underPointer = tab("wanted")
  await run(() => pointer(window, "pointermove", 100, 20))
  await run(() => root.unmount())
  await run(() => pointer(window, "pointerup", 100, 20))
  expect(stored.get(searchPlatformOrderKey)).toBe(before)
  expect(capture.size).toBe(0)
})
