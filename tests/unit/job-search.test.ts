import { afterEach, describe, expect, it, vi } from "vitest"
import { parseSearchHtml, parseWantedSearch } from "../../src/search/parser"
import { requestSearchPage } from "../../src/search/client"
import { searchUrls } from "../../src/search/sources"
import { appendSearchJobs, searchLimits, type SearchJob } from "../../src/search/model"
import { fixture } from "../helpers"
import { checkedSearchFilters, clearSearchCareer, defaultSearchFilters, hasSearchFilters, searchCareerLabel, setSearchCareerRange, toggleSearchCareer, toggleSearchGroup, toggleSearchRole, type SearchFilters } from "../../src/search/filters"

const signal = () => new AbortController().signal
const utf8 = (body: string, status = 200) => new Response(new TextEncoder().encode(body), { status })
const row = (id: number, name = "예시기업") => ({ id, position: "프론트엔드 개발자", company: { name }, annual_from: 1, annual_to: 3 })

afterEach(() => vi.useRealTimers())

describe("직접 요청 통합검색", () => {
  it("검색어를 URL 파라미터로만 인코딩하고 사이트·페이지를 고정한다", () => {
    const query = "React & next=evil#fragment"
    for (const platform of ["saramin", "jobkorea", "wanted"] as const) {
      const urls = searchUrls(platform, query, 2), url = new URL(urls.requestUrl)
      expect(url.searchParams.get(platform === "saramin" ? "searchword" : platform === "jobkorea" ? "stext" : "query")).toBe(query)
      expect(url.hash).toBe("")
      expect(url.searchParams.has("next")).toBe(false)
    }
    expect(new URL(searchUrls("wanted", "React", 2).requestUrl).searchParams.get("offset")).toBe("12")
    for (const page of [0, searchLimits.pages + 1, 1.5, NaN]) expect(() => searchUrls("saramin", "React", page)).toThrow()
    expect(new URL(searchUrls("jobkorea", "React", 100).requestUrl).searchParams.get("Page_No")).toBe("100")
    expect(() => searchUrls("wanted", " ")).toThrow()
    expect(() => searchUrls("wanted", "a".repeat(101))).toThrow()
  })
  it.each(["saramin", "jobkorea"] as const)("%s 공개 검색 캡처에서 공고와 정제된 원문 링크를 읽는다", platform => {
    const urls = searchUrls(platform, "React")
    const result = parseSearchHtml(platform, fixture(`public/${platform}Search.html`), urls.searchUrl, 1)
    expect(result.status).toBe("ok")
    expect(result.jobs).toHaveLength(2)
    for (const job of result.jobs) {
      expect(job.jobUrl).not.toMatch(/search_uuid|logpath|Oem_Code/)
      expect(job).not.toHaveProperty("element")
      expect(job.id).toMatch(new RegExp(`^${platform}:\\d+$`))
    }
  })
  it("사람인 광고 카드가 반복되어도 공고 ID로 중복을 제거하고 페이지 링크를 확인한다", () => {
    const card = '<div class="item_recruit"><div class="area_corp"><span class="corp_name"><a>예시기업</a></span></div><div class="area_job"><h2 class="job_tit"><a href="/zf_user/jobs/relay/view?rec_idx=123&search_uuid=secret">개발자</a></h2></div><div class="job_condition"><span>서울</span><span>경력무관</span></div><div class="job_date"><span class="date">상시채용</span></div></div>'
    const result = parseSearchHtml("saramin", `<main id="recruit_info_list">${card}${card}<div class="pagination"><a page="2">2</a></div></main>`, searchUrls("saramin", "개발자").searchUrl, 1)
    expect(result.jobs).toHaveLength(1)
    expect(result.jobs[0]).toMatchObject({ location: "서울", career: "경력무관", deadline: "상시채용" })
    expect(result.hasNext).toBe(true)
  })
  it("외부 링크·동일 도메인의 공고 아닌 경로는 결과로 노출하지 않는다", () => {
    const urls = ["https://evil.example/Recruit/GI_Read/123", "javascript:alert(1)", "https://www.jobkorea.co.kr/logout?gi_no=123"]
    const html = '<main>' + urls.map(url => `<div data-sentry-component="CardJob"><a href="/Recruit/GI_Read/123"><span>예시기업</span></a><a data-sentry-component="Title" href="${url}"><span>개발자</span></a></div>`).join("") + '</main>'
    expect(parseSearchHtml("jobkorea", html, searchUrls("jobkorea", "개발자").searchUrl, 1).jobs).toHaveLength(0)
  })
  it("인식하지 못한 페이지·접근 제한·로그인 화면을 검색 결과 0건과 구분한다", () => {
    const parse = (html: string) => parseSearchHtml("saramin", html, searchUrls("saramin", "React").searchUrl, 1)
    expect(parse('<main>검색결과가 없습니다.</main>').status).toBe("unreadable")
    expect(parse('<div id="recruit_info_list">검색 결과가 없습니다.</div>').status).toBe("empty")
    expect(parse('<title>Just a moment...</title><form id="challenge-form"></form>').status).toBe("blocked")
    expect(parse('<title>로그인</title>').status).toBe("login_required")
    expect(parse('<div id="__next"></div>').status).toBe("unreadable")
  })
  it("원티드 응답을 검증하며 쿠키·이메일·이미지 등은 결과에 포함하지 않는다", () => {
    const result = parseWantedSearch({ data: [{ ...row(123), email: "private@example.test", title_img: { origin: "https://example.test/image" } }, row(123), { id: "invalid" }], links: { next: "https://evil.example/steal" }, token: "PRIVATE_TOKEN" }, 1)
    expect(result.status).toBe("ok")
    expect(result.jobs).toHaveLength(1)
    expect(result.jobs[0]).toMatchObject({ id: "wanted:123", career: "1~3년", jobUrl: "https://www.wanted.co.kr/wd/123" })
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_TOKEN|private@example|title_img|evil.example/)
    expect(parseWantedSearch({ data: [] }, 1).status).toBe("empty")
    expect(parseWantedSearch({ data: [{ unexpected: true }] }, 1).status).toBe("unreadable")
    expect(parseWantedSearch({ results: [] }, 1).status).toBe("unreadable")
    expect(parseWantedSearch({ data: [row(1)], links: { next: "/next" } }, searchLimits.pages).hasNext).toBe(false)
  })
  it("공고 ID는 사이트별로 구분하고 교차 사이트 공고를 임의로 합치지 않는다", () => {
    const a = { id: "saramin:1" } as SearchJob, b = { id: "jobkorea:1" } as SearchJob, c = { id: "saramin:2" } as SearchJob
    expect(appendSearchJobs([a, c], [a, b])).toEqual([a, c, b])
  })
  it("키·쿠키 없이 확장 프로그램에서 직접 요청한다", async () => {
    const request = vi.fn().mockResolvedValue(utf8(JSON.stringify({ data: [row(1)] })))
    const result = await requestSearchPage("wanted", "React", 1, signal(), request)
    expect(result.status).toBe("ok")
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]![1]).toMatchObject({ method: "GET", credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" })
  })
  it.each([401, 403, 429, 500])("HTTP %s 오류를 성공/0건으로 보고하지 않고 자동 재시도하지 않는다", async status => {
    const request = vi.fn().mockResolvedValue(utf8("", status))
    const result = await requestSearchPage("jobkorea", "React", 1, signal(), request)
    expect(result.status).toBe(status === 401 ? "login_required" : status === 500 ? "error" : "blocked")
    expect(request).toHaveBeenCalledTimes(1)
    expect(result.jobs).toEqual([])
  })
  it("잘못된 JSON·네트워크 오류를 사이트별 실패로 반환한다", async () => {
    expect((await requestSearchPage("wanted", "React", 1, signal(), vi.fn().mockResolvedValue(utf8("<html>Login</html>")))).status).toBe("unreadable")
    expect((await requestSearchPage("wanted", "React", 1, signal(), vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))).status).toBe("error")
  })
  it("진행 중 요청을 중지하고 제한 시간 이후에는 타임아웃으로 반환한다", async () => {
    vi.useFakeTimers()
    const request = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("abort")))))
    const controller = new AbortController()
    const cancelled = requestSearchPage("wanted", "React", 1, controller.signal, request)
    controller.abort()
    expect((await cancelled).status).toBe("cancelled")
    const timeout = requestSearchPage("wanted", "React", 1, signal(), request)
    await vi.advanceTimersByTimeAsync(searchLimits.timeoutMs)
    expect((await timeout).status).toBe("timeout")
    const stopped = new AbortController(); stopped.abort()
    request.mockClear()
    expect((await requestSearchPage("wanted", "React", 1, stopped.signal, request)).status).toBe("cancelled")
    expect(request).not.toHaveBeenCalled()
  })
  it("큰 응답을 제한해 메모리와 DOM 파싱 부하를 줄인다", async () => {
    const response = utf8("x")
    response.headers.set("content-length", String(searchLimits.maxBytes + 1))
    const result = await requestSearchPage("saramin", "React", 1, signal(), vi.fn().mockResolvedValue(response))
    expect(result.status).toBe("error")
    expect(result.message).toContain("응답 크기")
  })
  it("검색어 없이 직군·세부 직무·지역·경력을 네이티브 조건으로 적용한다", () => {
    const filters = { ...defaultSearchFilters, role: ["frontend"], region: ["seoul"], career: ["new"] } as const
    const saramin = new URL(searchUrls("saramin", "", 4, filters).requestUrl)
    expect(Object.fromEntries(saramin.searchParams)).toMatchObject({ searchword: "", cat_kewd: "92", loc_mcd: "101000", exp_cd: "1", recruitPage: "4" })
    expect(saramin.searchParams.has("cat_mcls")).toBe(false)
    const jobkorea = new URL(searchUrls("jobkorea", "", 4, filters).requestUrl)
    expect(Object.fromEntries(jobkorea.searchParams)).toMatchObject({ duty: "1000230", local: "I000", careerType: "1", Page_No: "4" })
    const group = new URL(searchUrls("jobkorea", "", 1, { ...filters, group: ["development"], role: [] }).requestUrl)
    expect(group.searchParams.get("duty")?.split(",")).toContain("1000230")
    expect(group.searchParams.get("duty")?.split(",").every(code => /^\d{7}$/.test(code))).toBe(true)
    const any = new URL(searchUrls("saramin", "", 1, { ...filters, career: ["any"] }).requestUrl)
    expect(any.searchParams.get("exp_none")).toBe("y")
    expect(any.searchParams.has("exp_cd")).toBe(false)
  })
  it("원티드가 지원하지 않는 조건은 무시하지 않고 조회하지 않는다", async () => {
    const request = vi.fn()
    const result = await requestSearchPage("wanted", "React", 1, signal(), request, { ...defaultSearchFilters, group: ["design"] })
    expect(result.status).toBe("unsupported")
    expect(request).not.toHaveBeenCalled()
  })
  it("정의하지 않은 코드와 배열이 아닌 조건을 거절한다", () => {
    expect(() => searchUrls("saramin", "React", 1, { ...defaultSearchFilters, role: ["evil"] } as never)).toThrow()
    expect(() => searchUrls("jobkorea", "React", 1, { ...defaultSearchFilters, group: "evil" } as never)).toThrow()
    expect(() => checkedSearchFilters({ ...defaultSearchFilters, region: ["all"] } as never)).toThrow()
  })
  it("복수 직무·지역·경력을 요청 수를 늘리지 않고 한 URL의 네이티브 조건으로 묶는다", () => {
    const filters: SearchFilters = { group: ["design"], role: ["frontend", "backend"], region: ["seoul", "gyeonggi"], career: ["new", "experienced", "any"] }
    for (const page of [1, 2]) {
      const saramin = new URL(searchUrls("saramin", "", page, filters).requestUrl)
      expect(Object.fromEntries(saramin.searchParams)).toMatchObject({ cat_mcls: "15", cat_kewd: "92,84", loc_mcd: "101000,102000", exp_cd: "1,2", exp_none: "y", recruitPage: String(page) })
      const jobkorea = new URL(searchUrls("jobkorea", "", page, filters).requestUrl)
      expect(Object.fromEntries(jobkorea.searchParams)).toMatchObject({ local: "I000,B000", careerType: "1,2,4", Page_No: String(page) })
      const duties = jobkorea.searchParams.get("duty")!.split(",")
      expect(duties).toContain("1000230"); expect(duties).toContain("1000229"); expect(duties.length).toBeGreaterThan(2)
      expect(duties.length).toBe(new Set(duties).size)
    }
  })
  it("직군 전체와 세부 직무 전환은 다른 직군 선택을 보존하며 원래 조건을 변경하지 않는다", () => {
    const start: SearchFilters = { ...defaultSearchFilters, group: ["development", "design"] }
    const frontend = toggleSearchRole(start, "frontend"), both = toggleSearchRole(frontend, "backend")
    expect(both).toMatchObject({ group: ["design"], role: ["frontend", "backend"] })
    expect(start).toMatchObject({ group: ["development", "design"], role: [] })
    expect(toggleSearchRole(both, "frontend").role).toEqual(["backend"])
    const whole = toggleSearchGroup(both, "development")
    expect(whole).toMatchObject({ group: ["design", "development"], role: [] })
    expect(toggleSearchGroup(whole, "development")).toMatchObject({ group: ["design"], role: [] })
    expect(checkedSearchFilters({ ...both, group: ["development", "design", "design"] })).toEqual(both)
    expect(hasSearchFilters(defaultSearchFilters)).toBe(false)
    expect(hasSearchFilters(frontend)).toBe(true)
  })
  it.each([
    { career: ["new", "experienced"], careerMax: 3 },
    { career: ["experienced"], careerMin: 2, careerMax: 5 },
    { career: ["experienced"], careerMin: 5 },
    { career: ["experienced", "any"], careerMax: 3 }
  ] satisfies Partial<SearchFilters>[])("연차 범위 $careerMin ~ $careerMax를 다음 페이지에도 두 사이트 고유 파라미터로 유지한다", selected => {
    const filters: SearchFilters = { ...defaultSearchFilters, ...selected }
    for (const page of [1, 2]) {
      for (const platform of ["saramin", "jobkorea"] as const) {
        const params = new URL(searchUrls(platform, "", page, filters).requestUrl).searchParams
        expect(params.get(platform === "saramin" ? "exp_min" : "careerMin")).toBe(filters.careerMin === undefined ? null : String(filters.careerMin))
        expect(params.get(platform === "saramin" ? "exp_max" : "careerMax")).toBe(filters.careerMax === undefined ? null : String(filters.careerMax))
        expect(params.get(platform === "saramin" ? "exp_cd" : "careerType")).toBe(platform === "saramin" ? filters.career.filter(value => value !== "any").map(value => value === "new" ? "1" : "2").join(",") : filters.career.map(value => value === "new" ? "1" : value === "experienced" ? "2" : "4").join(","))
      }
    }
  })
  it("연차만 지정해도 경력 검색을 활성화하며 경력 해제·초기화 때 범위를 함께 지운다", () => {
    const ranged = setSearchCareerRange(defaultSearchFilters, "careerMax", 3)
    expect(ranged.career).toEqual(["new", "experienced"])
    expect(searchCareerLabel("experienced", ranged)).toBe("경력 3년 이하")
    const withNew = ranged
    expect(toggleSearchCareer(withNew, "experienced")).toMatchObject({ career: ["new"], careerMin: undefined, careerMax: undefined })
    expect(hasSearchFilters(clearSearchCareer(withNew))).toBe(false)
    expect(defaultSearchFilters.career).toEqual([])
    expect(hasSearchFilters({ ...defaultSearchFilters, careerMin: 2 })).toBe(true)
    expect(checkedSearchFilters({ ...defaultSearchFilters, careerMin: 2, careerMax: 5 }).career).toEqual(["experienced"])
  })
  it.each([{ careerMin: 5, careerMax: 2 }, { careerMin: 3, careerMax: 3 }, { careerMax: 0 }, { careerMin: -1 }, { careerMax: 21 }, { careerMax: 1.5 }, { careerMax: NaN }, { careerMin: Infinity }])("잘못된 연차 범위는 URL을 만들기 전에 거절한다: %j", invalid => {
    expect(() => searchUrls("saramin", "React", 1, { ...defaultSearchFilters, ...invalid })).toThrow()
    expect(() => searchUrls("jobkorea", "React", 1, { ...defaultSearchFilters, ...invalid })).toThrow()
  })
  it("원티드는 연차만 선택한 검색도 무시하지 않고 연결 전 상태로 구분한다", async () => {
    const request = vi.fn()
    expect((await requestSearchPage("wanted", "React", 1, signal(), request, { ...defaultSearchFilters, careerMax: 3 })).status).toBe("unsupported")
    expect(request).not.toHaveBeenCalled()
  })
  it("최소 신입을 두 사이트의 신입 포함 조건으로 연결하고 신입 해제와 양의 최소 연차를 동기화한다", () => {
    const filters = setSearchCareerRange({ ...defaultSearchFilters, career: ["experienced"], careerMin: 2, careerMax: 3 }, "careerMin", 0)
    expect(filters).toMatchObject({ career: ["new", "experienced"], careerMin: 0, careerMax: 3 })
    const saramin = new URL(searchUrls("saramin", "", 1, filters).requestUrl).searchParams
    expect(saramin.get("exp_cd")).toBe("1,2"); expect(saramin.has("exp_min")).toBe(false); expect(saramin.get("exp_max")).toBe("3")
    const jobkorea = new URL(searchUrls("jobkorea", "", 1, filters).requestUrl).searchParams
    expect(jobkorea.get("careerMin")).toBe("0"); expect(jobkorea.get("careerType")).toBe("1,2")
    expect(toggleSearchCareer(filters, "new")).toMatchObject({ career: ["experienced"], careerMin: undefined, careerMax: 3 })
    expect(setSearchCareerRange(filters, "careerMin", 2)).toMatchObject({ career: ["experienced"], careerMin: 2 })
    expect(checkedSearchFilters({ ...defaultSearchFilters, careerMin: 0 }).career).toEqual(["new", "experienced"])
  })
})
