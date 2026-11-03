import { afterEach, describe, expect, it, vi } from "vitest"
import { checkedSearchFilters, defaultSearchFilters, developmentRoles, jobGroups, searchRegions, type SearchFilters } from "../../src/search/filters"
import { rememberCareers } from "../../src/search/remember"
import { parseRememberSearch } from "../../src/search/remember-parser"
import { requestSearchPage } from "../../src/search/client"
import { searchUrls } from "../../src/search/sources"
import { defaultSearchPreferences, readSearchPreferences, saveSearchPreferences } from "../../src/search/preferences"
import { readSearchBookmarks, setSearchBookmark, syncSearchBookmarkGeneration } from "../../src/search/bookmarks"
import categories from "../../src/search/remember-categories.json"

const filters: SearchFilters = { ...defaultSearchFilters, role: ["frontend"], region: ["seoul"], career: ["new", "experienced"], careerMin: 0, careerMax: 3 }
const row = (id: number) => ({ id, title: `공고 ${id}`, status: "published", organization: { name: `기업 ${id}` },
  min_experience: 1, max_experience: 5, normalized_address: { level1: "서울", level2: "강남구" }, explicit_due: false })
const raw = (ids: number[], page = 1, pages = 1) => ({ data: ids.map(row), meta: { page, total_pages: pages } })
const response = (ids: number[], page = 1, pages = 1, status = 200) => new Response(JSON.stringify(raw(ids, page, pages)), { status })
const bodies = (selected: SearchFilters, keyword = "React & Next=evil#hash", page = 1) => {
  const urls = searchUrls("remember", keyword, page, selected)
  if (!("bodies" in urls)) throw Error("Missing Remember requests")
  return urls.bodies.map(body => JSON.parse(body))
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe("리멤버 네이티브 통합검색", () => {
  it("검색어·직무·복수 지역·연차·페이지를 실제 snake_case POST 조건에 함께 전달한다", () => {
    const selected = { ...filters, region: ["seoul", "jeonnam"] } as const
    expect(bodies(selected, "React & Next=evil#hash", 2)).toEqual([{ page: 2, per: 30, sort: "starts_at_desc", search: {
      keywords: ["React & Next=evil#hash"], job_category_ids: [311], addresses: [["서울특별시"], ["전라남도"], ["광주광역시"]],
      min_experience: 0, max_experience: 3, include_applied_job_posting: true
    } }])
    const urls = searchUrls("remember", "React", 1, filters)
    expect(urls.requestUrl).toBe("https://career-api.rememberapp.co.kr/job_postings/search")
    const outward = JSON.parse(new URL(urls.searchUrl).searchParams.get("search")!)
    expect(outward).toMatchObject({ keywords: ["React"], jobCategoryNames: [{ level1: "SW개발", level2: "프론트엔드" }] })
    expect(bodies(filters, "")[0].search).not.toHaveProperty("keywords")
    for (const page of [0, 1.5, 1001]) expect(() => bodies(filters, "", page)).toThrow()
    expect(() => bodies(defaultSearchFilters, " ")).toThrow()
    expect(() => bodies(filters, "a".repeat(101))).toThrow()
  })
  it("모든 공통 직군·직무를 유효한 리멤버 세부 코드로 펼치고 전체 직군의 중복을 제거한다", () => {
    const known = new Set(Object.values(categories).flat().map(role => role.id))
    for (const group of jobGroups.filter(group => group.id !== "all")) {
      const ids = bodies({ ...defaultSearchFilters, group: [group.id as SearchFilters["group"][number]] })[0].search.job_category_ids
      expect(ids.length).toBeGreaterThan(0); expect(ids.every((id: number) => known.has(id))).toBe(true)
    }
    for (const role of developmentRoles.filter(role => role.id !== "all")) {
      const ids = bodies({ ...defaultSearchFilters, role: [role.id as SearchFilters["role"][number]] })[0].search.job_category_ids
      expect(ids.length).toBeGreaterThan(0); expect(ids.every((id: number) => known.has(id))).toBe(true)
    }
    for (const region of searchRegions.filter(region => region.id !== "all")) {
      expect(bodies({ ...defaultSearchFilters, region: [region.id as SearchFilters["region"][number]] })[0].search.addresses.length).toBeGreaterThan(0)
    }
    expect(bodies({ ...filters, group: ["development"], role: ["frontend"] })[0].search.job_category_ids).toEqual([311])
    expect(() => bodies({ ...filters, role: ["evil"] } as never)).toThrow()
  })
  it.each([
    [{}, [{}]], [{ career: ["any"] }, [{ career_year: -1 }]],
    [{ career: ["new"] }, [{ min_experience: 0, max_experience: 0 }]],
    [{ career: ["experienced"] }, [{ min_experience: 1 }]],
    [{ career: ["new", "experienced"] }, [{ min_experience: 0 }]],
    [{ career: ["new", "experienced", "any"] }, [{}]],
    [{ careerMin: 2, careerMax: 5 }, [{ min_experience: 2, max_experience: 5 }]],
    [{ career: ["new", "experienced", "any"], careerMin: 2, careerMax: 5 }, [{ min_experience: 0, max_experience: 0 }, { min_experience: 2, max_experience: 5 }, { career_year: -1 }]],
    [{ career: ["any"], careerMax: 3 }, [{ min_experience: 1, max_experience: 3 }, { career_year: -1 }]],
    [{ careerMin: 0, careerMax: 3 }, [{ min_experience: 0, max_experience: 3 }]]
  ])("경력무관의 네이티브 우선 적용과 연차 사이의 빈 범위를 별도 OR 요청으로 보존한다: %j", (partial, expected) => {
    expect(rememberCareers(checkedSearchFilters({ ...defaultSearchFilters, ...partial } as SearchFilters))).toEqual(expected)
  })
  it("공고 텍스트와 정규 상세 주소만 사용하고 응답의 지원·채용담당자·추적 정보를 버린다", () => {
    const result = parseRememberSearch({ ...raw([]), data: [{ ...row(1), link: "https://evil.example/apply", recruiter: { email: "PRIVATE" }, application: { status: "PRIVATE" } }, row(1), { id: "bad" }] }, 1)
    expect(result.status).toBe("ok"); expect(result.jobs).toHaveLength(1)
    expect(result.jobs[0]).toEqual({ id: "remember:1", platform: "remember", jobTitle: "공고 1", companyName: "기업 1",
      jobUrl: "https://career.rememberapp.co.kr/job/posting/1", location: "서울 강남구", career: "1~5년", deadline: "상시채용" })
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|evil.example|recruiter|application/)
    expect(parseRememberSearch(raw([], 2), 2).status).toBe("empty")
    for (const value of [{ data: [] }, raw([1], 2), { ...raw([]), data: [{ ...row(1), status: "closed" }] }]) expect(parseRememberSearch(value, 1).status).toBe("unreadable")
    expect(parseRememberSearch(raw([1], 1, 2), 1).hasNext).toBe(true)
    expect(parseRememberSearch(raw([1], 1000, 1001), 1000).hasNext).toBe(false)
  })
  it("명시된 마감일의 한국 날짜와 신입·경력무관·지역 대체값을 읽는다", () => {
    const result = parseRememberSearch({ ...raw([]), data: [
      { ...row(1), min_experience: 0, max_experience: 0, ends_at: "2026-11-03T15:00:00Z", explicit_due: true },
      { ...row(2), min_experience: null, max_experience: null, normalized_address: null, addresses: [{ address_level1: "경기도", address_level2: "성남시" }] },
      { ...row(3), min_experience: 2, max_experience: null, ends_at: "invalid", explicit_due: true }
    ] }, 1)
    expect(result.jobs[0]).toMatchObject({ career: "신입", deadline: "2026-11-04" })
    expect(result.jobs[1]).toMatchObject({ career: "경력무관", location: "경기도 성남시" })
    expect(result.jobs[2]).toMatchObject({ career: "2년 이상", deadline: undefined })
  })
  it("키·쿠키·기기 ID 없이 조회하며 모든 OR 응답이 성공한 경우만 중복 없이 합친다", async () => {
    const request = vi.fn(async (_url, init?: RequestInit) => {
      const search = JSON.parse(init!.body as string).search
      return response(search.career_year === -1 ? [2, 3] : [1, 2], 2, search.career_year === -1 ? 2 : 3)
    })
    const result = await requestSearchPage("remember", "React", 2, new AbortController().signal, request, { ...filters, career: ["new", "experienced", "any"] })
    expect(result.jobs.map(job => job.id)).toEqual(["remember:1", "remember:2", "remember:3"])
    expect(result.hasNext).toBe(true); expect(request).toHaveBeenCalledTimes(2)
    for (const [url, init] of request.mock.calls) {
      expect(url).toBe("https://career-api.rememberapp.co.kr/job_postings/search")
      expect(init).toMatchObject({ method: "POST", credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer", headers: { "Content-Type": "application/json" } })
      expect(JSON.parse(init!.body as string).search).toMatchObject({ keywords: ["React"], job_category_ids: [311], addresses: [["서울특별시"]] })
      expect(JSON.stringify(init)).not.toMatch(/Authorization|deviceUid|logger|cookie/i)
    }
    const failed = vi.fn(async (_url, init?: RequestInit) => response([1], 1, 1, JSON.parse(init!.body as string).search.career_year === -1 ? 429 : 200))
    expect(await requestSearchPage("remember", "React", 1, new AbortController().signal, failed, { ...filters, career: ["new", "experienced", "any"] })).toMatchObject({ jobs: [], status: "blocked", hasNext: false })
    expect(failed).toHaveBeenCalledTimes(2)
  })
  it("인식 실패·네트워크·취소·시간 제한을 결과 없음과 구분한다", async () => {
    const run = (fetcher: typeof fetch, signal = new AbortController().signal) => requestSearchPage("remember", "React", 1, signal, fetcher)
    expect((await run(vi.fn(async () => new Response("<html>login</html>")))).status).toBe("unreadable")
    expect((await run(vi.fn(async () => response([], 1, 1, 401)))).status).toBe("login_required")
    expect((await run(vi.fn(async () => { throw Error("network") }))).status).toBe("error")
    vi.useFakeTimers()
    const pending = vi.fn((_url, init?: RequestInit) => new Promise<Response>((_, reject) => init!.signal!.addEventListener("abort", () => reject(Error("abort")))))
    const controller = new AbortController(), cancelled = run(pending, controller.signal)
    controller.abort(); expect((await cancelled).status).toBe("cancelled")
    const timed = run(pending)
    await vi.advanceTimersByTimeAsync(20000); expect((await timed).status).toBe("timeout")
  })
  it("기본 검색 사이트에 추가하고 기존 세 사이트 선택을 보존하며 리멤버 북마크를 복원한다", () => {
    const saved = new Map<string, string>()
    const storage: Storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value) },
      removeItem: key => { saved.delete(key) }, clear: () => saved.clear(), key: index => [...saved.keys()][index] ?? null, get length() { return saved.size } }
    vi.stubGlobal("localStorage", storage)
    expect(defaultSearchPreferences().sites).toContain("remember")
    const previous = { ...defaultSearchPreferences(), sites: ["saramin", "jobkorea", "wanted"] as ("saramin" | "jobkorea" | "wanted")[] }
    saveSearchPreferences(previous); expect(readSearchPreferences()).toEqual(previous)
    syncSearchBookmarkGeneration("workspace")
    const job = parseRememberSearch(raw([1]), 1).jobs[0]!
    setSearchBookmark({ ...job, jobUrl: job.jobUrl + "?tracking=PRIVATE#session" }, true, "workspace")
    expect(readSearchBookmarks("workspace")[0]!.job).toEqual(job)
    expect(() => setSearchBookmark({ ...job, jobUrl: "https://profile.rememberapp.co.kr/applies" }, true, "workspace")).toThrow()
    setSearchBookmark(job, false, "workspace"); expect(readSearchBookmarks("workspace")).toEqual([])
  })
})
