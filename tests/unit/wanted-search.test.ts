import { afterEach, describe, expect, it, vi } from "vitest"
import { checkedSearchFilters, defaultSearchFilters, developmentRoles, jobGroups, searchRegions, type SearchFilters } from "../../src/search/filters"
import { searchUrls } from "../../src/search/sources"
import { requestSearchPage } from "../../src/search/client"
import { WantedIntersection } from "../../src/search/wanted-intersection"
import { parseWantedSearch } from "../../src/search/parser"
import groups from "../../src/search/wanted-groups.json"
import { wantedYears } from "../../src/search/wanted"

const junior: SearchFilters = { ...defaultSearchFilters, role: ["frontend"], region: ["seoul"], career: ["new", "experienced"], careerMin: 0, careerMax: 3 }
const response = (ids: number[], next = false) => new Response(JSON.stringify({ data: ids.map(id => ({ id, position: `공고 ${id}`, company: { name: `기업 ${id}` }, address: { location: "서울", district: "강남구" }, annual_from: 0, annual_to: 3 })), links: { next: next ? "/untrusted-next?offset=12" : null } }), { headers: { "Content-Type": "application/json" } })
const page = (ids: number[], next = false) => parseWantedSearch({ data: ids.map(id => ({ id, position: `공고 ${id}`, company: { name: `기업 ${id}` } })), links: { next: next ? "/next" : null } }, 1)
afterEach(() => vi.useRealTimers())

describe("원티드 네이티브 검색 조건", () => {
  it("키워드 없이 직무·지역·신입~3년과 다음 페이지를 직접 요청한다", () => {
    const urls = searchUrls("wanted", "", 2, junior), request = new URL(urls.requestUrl)
    expect(request.pathname).toBe("/api/chaos/navigation/v1/results")
    expect(request.searchParams.getAll("job_ids")).toEqual(["669"])
    expect(request.searchParams.getAll("years")).toEqual(["0", "1", "2", "3"])
    expect(request.searchParams.getAll("locations")).toEqual(["seoul.all"])
    expect(request.searchParams.get("offset")).toBe("12")
    expect("comparisonUrl" in urls).toBe(false)
  })
  it("검색어와 지역·경력은 검색 API에 전달하고 검색어와 직무는 목록 대조도 요청한다", () => {
    const urls = searchUrls("wanted", "React & Next.js", 3, junior)
    expect("comparisonUrl" in urls).toBe(true)
    const keyword = new URL(urls.requestUrl), listing = new URL((urls as { comparisonUrl: string }).comparisonUrl)
    expect(keyword.searchParams.get("query")).toBe("React & Next.js")
    expect(keyword.searchParams.has("job_ids")).toBe(false)
    expect(listing.searchParams.has("query")).toBe(false)
    expect(listing.searchParams.getAll("job_ids")).toEqual(["669"])
    for (const key of ["country", "years", "locations", "offset", "limit"]) expect(keyword.searchParams.getAll(key)).toEqual(listing.searchParams.getAll(key))
    expect(keyword.searchParams.get("offset")).toBe("24")
    expect("comparisonUrl" in searchUrls("wanted", "React", 1, { ...junior, role: [] })).toBe(false)
  })
  it("복수 직무·직군·지역을 반복 파라미터로 보내고 중복을 제거한다", () => {
    const filters = { ...junior, group: ["design"], role: ["frontend", "app"], region: ["seoul", "jeonnam"] } as const
    const params = new URL(searchUrls("wanted", "", 1, filters).requestUrl).searchParams
    expect(params.getAll("job_ids")).toEqual(expect.arrayContaining(["669", "677", "678", "10111", String(groups["511"][0])]))
    expect(params.getAll("locations")).toEqual(["seoul.all", "s-jeolla.all", "gwangju.all"])
    expect(new Set(params.getAll("job_ids")).size).toBe(params.getAll("job_ids").length)
  })
  it("전체 공통 직군과 세부 직무를 실제 원티드 역할 코드로만 변환한다", () => {
    const known = new Set(Object.values(groups).flat().map(String))
    for (const group of jobGroups.filter(group => group.id !== "all")) {
      const ids = new URL(searchUrls("wanted", "", 1, { ...defaultSearchFilters, group: [group.id as SearchFilters["group"][number]] }).requestUrl).searchParams.getAll("job_ids")
      expect(ids.length).toBeGreaterThan(0); expect(ids.every(id => known.has(id))).toBe(true)
    }
    for (const role of developmentRoles.filter(role => role.id !== "all")) {
      const ids = new URL(searchUrls("wanted", "", 1, { ...defaultSearchFilters, role: [role.id as SearchFilters["role"][number]] }).requestUrl).searchParams.getAll("job_ids")
      expect(ids.length).toBeGreaterThan(0); expect(ids.every(id => known.has(id))).toBe(true)
    }
    for (const region of searchRegions.filter(region => region.id !== "all")) {
      expect(new URL(searchUrls("wanted", "", 1, { ...defaultSearchFilters, region: [region.id as SearchFilters["region"][number]] }).requestUrl).searchParams.getAll("locations").length).toBeGreaterThan(0)
    }
  })
  it.each([
    [{ career: ["new"] }, [0]], [{ careerMin: 2, careerMax: 5 }, [2, 3, 4, 5]],
    [{ careerMin: 20 }, [20]], [{ career: ["any"] }, [-1]], [{}, [-1]]
  ])("네이티브 경력 조건을 변환한다: %j", (filters, expected) => {
    expect(wantedYears(checkedSearchFilters({ ...defaultSearchFilters, ...filters } as SearchFilters))).toEqual(expected)
  })
})

describe("원티드 검색어·직무 응답의 점진적 대조", () => {
  it("첫 묶음에 없어도 다음 페이지와 이전 페이지를 교차 대조하고 중복 없이 출력한다", () => {
    const session = new WantedIntersection(); session.prepare("criteria")
    expect(session.merge(1, page([1, 2], true), page([3, 4], true))).toMatchObject({ jobs: [], status: "ok", hasNext: true, matching: true })
    const second = session.merge(2, page([4, 5], false), page([1, 5], true))
    expect(second.jobs.map(job => job.id)).toEqual(["wanted:1", "wanted:4", "wanted:5"])
    expect(second.hasNext).toBe(true)
    const last = session.merge(3, page([]), page([2], false))
    expect(last.jobs.map(job => job.id)).toEqual(["wanted:2"])
    expect(last.hasNext).toBe(false)
    expect(session.cached(2)).toBe(second)
  })
  it("한쪽 목록이 끝나도 미대조 공고는 다른 쪽의 다음 페이지에서 계속 찾는다", () => {
    const session = new WantedIntersection(); session.prepare("criteria")
    expect(session.merge(1, page([30], false), page([1], true)).hasNext).toBe(true)
    expect(session.merge(2, page([]), page([30], true))).toMatchObject({ hasNext: false, jobs: [{ id: "wanted:30" }] })
  })
  it("둘 다 끝나거나 한쪽이 비었을 때만 대조 결과 없음을 확정한다", () => {
    const session = new WantedIntersection(); session.prepare("first")
    expect(session.merge(1, page([]), page([1], true))).toMatchObject({ hasNext: false, status: "empty" })
    session.prepare("second")
    expect(session.merge(1, page([1]), page([2]))).toMatchObject({ hasNext: false, status: "empty" })
  })
  it("한쪽 오류는 ID·출력·진행을 소비하지 않아 같은 페이지 재시도가 안전하다", () => {
    const session = new WantedIntersection(); session.prepare("criteria")
    expect(session.merge(1, page([1]), { jobs: [], hasNext: false, status: "blocked" }).status).toBe("blocked")
    expect(session.keywordDone).toBe(false); expect(session.cached(1)).toBeUndefined()
    expect(session.merge(1, page([1]), page([1])).jobs).toHaveLength(1)
    session.prepare("new search")
    expect(session.cached(1)).toBeUndefined()
    expect(session.merge(1, page([2]), page([1])).jobs).toEqual([])
  })
  it("서버가 같은 목록을 반복하면 자동 진행을 종료한다", () => {
    const session = new WantedIntersection(); session.prepare("criteria")
    session.merge(1, page([1], true), page([2], true))
    expect(session.merge(2, page([1], true), page([2], true))).toMatchObject({ hasNext: false, status: "empty" })
  })
  it("실제 요청 두 개를 대조하고 다음 페이지에서도 같은 조건과 이미 끝난 쪽을 유지한다", async () => {
    const session = new WantedIntersection(), calls: URL[] = []
    const fetcher = vi.fn(async (raw: string | URL | Request, init?: RequestInit) => {
      expect(init).toMatchObject({ credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" })
      const url = new URL(String(raw)); calls.push(url)
      const keyword = url.pathname.includes("search/v1"), offset = Number(url.searchParams.get("offset"))
      return keyword ? response([30]) : response(offset === 0 ? [1] : [30], true)
    }) as unknown as typeof fetch
    const first = await requestSearchPage("wanted", "React", 1, new AbortController().signal, fetcher, junior, session)
    expect(first).toMatchObject({ jobs: [], status: "ok", hasNext: true, matching: true })
    const second = await requestSearchPage("wanted", "React", 2, new AbortController().signal, fetcher, junior, session)
    expect(second.jobs).toMatchObject([{ id: "wanted:30", location: "서울 강남구" }])
    expect(second.hasNext).toBe(false); expect(calls).toHaveLength(3)
    expect(calls[2]!.searchParams.get("offset")).toBe("12")
    for (const url of calls) expect(url.searchParams.getAll("years")).toEqual(["0", "1", "2", "3"])
    await requestSearchPage("wanted", "React", 2, new AbortController().signal, fetcher, junior, session)
    expect(calls).toHaveLength(3)
  })
  it("중지된 병렬 요청은 중간 결과를 저장하지 않고 다시 실행할 수 있다", async () => {
    const session = new WantedIntersection(), controller = new AbortController()
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => String(url).includes("navigation") ? new Promise<Response>((_, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("abort")))) : response([1])) as unknown as typeof fetch
    const pending = requestSearchPage("wanted", "React", 1, controller.signal, fetcher, junior, session)
    controller.abort()
    expect((await pending).status).toBe("cancelled")
    expect(session.cached(1)).toBeUndefined()
    expect(session.keywordDone).toBe(false)
    const retried = await requestSearchPage("wanted", "React", 1, new AbortController().signal, vi.fn().mockImplementation(() => response([1])), junior, session)
    expect(retried.jobs).toHaveLength(1)
  })
})
