import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { readSearchBookmarks, searchBookmarkPrefix, setSearchBookmark, syncSearchBookmarkGeneration } from "../../src/search/bookmarks"
import type { SearchJob } from "../../src/search/model"

const stored = new Map<string, string>()
const storage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value) },
  removeItem: (key: string) => { stored.delete(key) },
  key: (index: number) => [...stored.keys()][index] ?? null,
  get length() { return stored.size }
} as Storage
const job = (id = "1"): SearchJob => ({ id: `wanted:${id}`, platform: "wanted", companyName: "예시기업", jobTitle: "프론트엔드", jobUrl: `https://www.wanted.co.kr/wd/${id}`, location: "서울", career: "신입" })
beforeEach(() => { stored.clear(); vi.stubGlobal("localStorage", storage); syncSearchBookmarkGeneration("workspace") })
afterEach(() => vi.unstubAllGlobals())

it("명시적으로 저장한 공고만 복원하고 사이트·공고 ID로 구분하며 원문 추적 쿼리를 제거한다", () => {
  expect(readSearchBookmarks("workspace")).toEqual([])
  setSearchBookmark({ ...job(), jobUrl: job().jobUrl + "?tracking=PRIVATE#session" }, true, "workspace")
  setSearchBookmark({ ...job(), id: "jobkorea:1", platform: "jobkorea", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/1" }, true, "workspace")
  expect(readSearchBookmarks("workspace")).toHaveLength(2)
  expect(readSearchBookmarks("workspace").find(bookmark => bookmark.job.platform === "wanted")!.job.jobUrl).toBe(job().jobUrl)
  expect([...stored.values()].join(" ")).not.toContain("PRIVATE")
  setSearchBookmark(job(), false, "workspace")
  expect(readSearchBookmarks("workspace").map(bookmark => bookmark.job.id)).toEqual(["jobkorea:1"])
})

it("각 공고를 별도 키로 저장해 다른 탭의 공고를 덮어쓰지 않고 최근 저장순으로 복원한다", () => {
  vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(300)
  setSearchBookmark(job("1"), true, "workspace")
  setSearchBookmark(job("2"), true, "workspace")
  setSearchBookmark({ ...job("1"), jobTitle: "새 제목" }, true, "workspace")
  expect(readSearchBookmarks("workspace").map(bookmark => bookmark.job.id)).toEqual(["wanted:1", "wanted:2"])
  expect(readSearchBookmarks("workspace")[0]!.job.jobTitle).toBe("새 제목")
  vi.restoreAllMocks()
})

it.each([
  { jobUrl: "javascript:alert(1)" }, { jobUrl: "https://evil.example/wd/1" },
  { jobUrl: "https://user:secret@www.wanted.co.kr/wd/1" }, { id: "wanted:999" },
  { jobUrl: "https://www.wanted.co.kr/profile?rec_idx=1" }, { profile: "PRIVATE" }
])("손상되거나 공고와 맞지 않는 입력은 저장하지 않는다: %j", change => {
  expect(() => setSearchBookmark({ ...job(), ...change }, true, "workspace")).toThrow()
  expect(readSearchBookmarks("workspace")).toEqual([])
})

it("손상된 항목을 건너뛰고 다른 저장 항목은 유지한다", () => {
  setSearchBookmark(job(), true, "workspace")
  stored.set(searchBookmarkPrefix + "wanted:2", "not-json")
  stored.set(searchBookmarkPrefix + "wanted:3", stored.get(searchBookmarkPrefix + "wanted:1")!)
  expect(readSearchBookmarks("workspace").map(bookmark => bookmark.job.id)).toEqual(["wanted:1"])
})

it("전체 데이터 초기화 후 저장을 지우고 이전 화면의 재저장을 막으며 검색 설정은 보존한다", () => {
  stored.set("todaystart.job-search.preferences", "KEEP")
  setSearchBookmark(job(), true, "workspace")
  syncSearchBookmarkGeneration("reset")
  expect([...stored.keys()].some(key => key.startsWith(searchBookmarkPrefix))).toBe(false)
  expect(readSearchBookmarks("workspace")).toEqual([])
  expect(stored.get("todaystart.job-search.preferences")).toBe("KEEP")
  expect(() => setSearchBookmark(job(), true, "workspace")).toThrow(/초기화/)
  setSearchBookmark(job("2"), true, "reset")
  expect(readSearchBookmarks("reset")).toHaveLength(1)
})

it("저장 공간 오류를 삼키고 저장 완료로 처리하지 않는다", () => {
  const unavailable = { ...storage, setItem: () => { throw new Error("quota") } } as Storage
  expect(() => setSearchBookmark(job(), true, "workspace", unavailable)).toThrow("quota")
  expect(readSearchBookmarks("workspace")).toEqual([])
})
