import { describe, it, expect } from "vitest"
import { historyFilterKey, historyNavigationUrl, historyPagination, isBuiltInHistoryUrl } from "../../src/platforms/history-pagination"

const suffix = "pageCount=20&search_period=1&start_date=2026-09-19&end_date=2026-10-19&read_status=tot&order_type=update"
const first = `https://www.saramin.co.kr/zf_user/persons/apply-status-list/page/1?page=2&${suffix}`
const second = `https://www.saramin.co.kr/zf_user/persons/apply-status-list/page/2?page=1&${suffix}`
function doc(html: string) { return new DOMParser().parseFromString(html, "text/html") }
describe("지원 현황 페이지네이션", () => {
  it("Page=1#로만 바뀌는 링크를 다음 페이지로 오인하지 않는다", () => {
    const base = "https://www.jobkorea.co.kr/User/ApplyMng?Page=1"
    expect(historyPagination(doc('<a href="#">다음</a>'), "jobkorea", base).hasNextPage).toBe(false)
    expect(historyPagination(doc('<a href="?Page=1#">다음</a>'), "jobkorea", base).hasNextPage).toBe(false)
  })
  it("페이지 그룹 이동 버튼보다 바로 다음 번호를 먼저 선택하고 잡코리아 Page URL로 이동한다", () => {
    const base = "https://www.jobkorea.co.kr/User/ApplyMng?From_Dt=2026-07-21&To_Dt=2026-10-19&ReadStat=0&Page=1#"
    const pagination = historyPagination(doc('<a href="#">다음</a><nav aria-label="페이지"><span>1</span><a href="javascript:testPage(11)">다음</a><a href="javascript:testPage(2)">2</a></nav>'), "jobkorea", base)
    expect(pagination.next?.textContent).toBe("2")
    const next = new URL(historyNavigationUrl("jobkorea", base, pagination, "NEXT_PAGE")!)
    expect(next.searchParams.get("Page")).toBe("2")
    expect(next.searchParams.get("From_Dt")).toBe("2026-07-21")
    expect(next.searchParams.get("To_Dt")).toBe("2026-10-19")
    expect(next.searchParams.get("ReadStat")).toBe("0")
    expect(next.hash).toBe("")
    expect(historyNavigationUrl("saramin", "https://www.saramin.co.kr/zf_user/persons/apply-status-list", pagination, "NEXT_PAGE")).toBeUndefined()
    expect(historyNavigationUrl("jobkorea", base, historyPagination(doc(""), "jobkorea", base), "NEXT_PAGE")).toBeUndefined()
  })
  const saraminBase = "https://www.saramin.co.kr/zf_user/persons/apply-status-list"
  it("사람인 기본 URL은 번호 없이 첫 페이지를 시작하고 실제 다음 버튼을 사용한다", () => {
    const result = historyPagination(doc('<nav aria-label="페이지"><button aria-label="다음 페이지">다음</button></nav>'), "saramin", saraminBase)
    expect(result).toMatchObject({ currentPage: 1, hasNextPage: true })
    expect(result.next?.tagName).toBe("BUTTON")
  })
  it("사람인은 URL이 그대로여도 화면의 span 현재 번호와 숫자 버튼을 읽는다", () => {
    const result = historyPagination(doc('<nav aria-label="페이지"><button>1</button><span>2</span><button>3</button></nav>'), "saramin", saraminBase)
    expect(result).toMatchObject({ currentPage: 2, hasNextPage: true, hasFirstPage: true })
    expect(result.next?.textContent).toBe("3")
  })
  it("URL 이동 없는 페이지 영역의 실제 클릭 컨트롤과 비활성 현재 버튼을 구분한다", () => {
    const result = historyPagination(doc('<nav aria-label="페이지"><a href="javascript:void(0)">1</a><button disabled>2</button><a href="javascript:void(0)">3</a></nav>'), "saramin", saraminBase)
    expect(result).toMatchObject({ currentPage: 2, hasNextPage: true, hasFirstPage: true })
    expect(result.next?.textContent).toBe("3")
    expect(historyPagination(doc('<a href="javascript:void(0)">다음</a><button>다음</button>'), "saramin", saraminBase).hasNextPage).toBe(false)
  })
  it("마지막 화면의 비활성 다음 버튼으로 완료를 확인하며 URL을 만들어 이동하지 않는다", () => {
    const result = historyPagination(doc('<nav aria-label="페이지"><button>1</button><strong>2</strong><button aria-label="다음 페이지" disabled>다음</button></nav>'), "saramin", saraminBase)
    expect(result).toMatchObject({ currentPage: 2, hasNextPage: false, endKnown: true })
  })
  it("현재 숫자 옆의 사이트 자체 JavaScript 페이지 링크는 실행문을 해석하지 않고 클릭 대상으로 둔다", () => {
    const result = historyPagination(doc('<div><a href="javascript:testPage(1)">1</a><strong>2</strong><a href="javascript:testPage(3)">3</a></div>'), "saramin", saraminBase)
    expect(result).toMatchObject({ currentPage: 2, hasNextPage: true, hasFirstPage: true })
    expect(result.next?.getAttribute("href")).toBe("javascript:testPage(3)")
  })
  const jobkoreaBase = "https://www.jobkorea.co.kr/User/ApplyMng?From_Dt=2026-07-21&To_Dt=2026-10-19&StatusStat=0&Order_Apply=0&IngStat=0&ReadStat=0"
  it("잡코리아의 번호 없는 초기 지원 현황은 1페이지에서 수집을 시작한다", () => {
    const result = historyPagination(doc(`<div><span>1</span><a href="${jobkoreaBase}&Page=2">2</a></div>`), "jobkorea", jobkoreaBase)
    expect(result).toMatchObject({ currentPage: 1, hasNextPage: true, paginationFound: true })
    expect(result.next?.getAttribute("href")).toBe(`${jobkoreaBase}&Page=2`)
  })
  it.each([1, 2])("사용자가 제공한 잡코리아 Page=%i를 화면의 현재 번호 표시 없이 읽는다", page => {
    const result = historyPagination(doc("<main>지원 현황</main>"), "jobkorea", `${jobkoreaBase}&Page=${page}`)
    expect(result.currentPage).toBe(page)
    expect(result.scope).toBe(`2026-07-21 ~ 2026-10-19 · ${page}페이지`)
    expect(historyFilterKey(`${jobkoreaBase}&Page=1`)).toBe(historyFilterKey(`${jobkoreaBase}&Page=2`))
    expect(historyFilterKey(`${jobkoreaBase}&Page=1`)).not.toBe(historyFilterKey(`${jobkoreaBase.replace("ReadStat=0", "ReadStat=1")}&Page=2`))
  })
  it("잡코리아는 URL의 명시적 Page를 이전 화면의 숫자보다 우선한다", () => {
    expect(historyPagination(doc('<nav aria-label="페이지"><strong aria-current="page">1</strong></nav>'), "jobkorea", `${jobkoreaBase}&Page=2`).currentPage).toBe(2)
  })
  it.each(["Page=0", "Page=invalid", "Page=1&page=2"])("잘못되거나 충돌한 잡코리아 번호를 기본 1페이지로 덮지 않는다: %s", query => {
    expect(historyPagination(doc(""), "jobkorea", `${jobkoreaBase}&${query}`).currentPage).toBeUndefined()
  })
  it("원티드 page·offset은 이동 값이며 날짜·limit은 조회 조건으로 보존한다", () => {
    const base = "https://www.wanted.co.kr/status/applications/applied?q&start_date=&end_date=&page=1&offset=0&limit=10"
    const next = base.replace("page=1&offset=0", "page=2&offset=10")
    expect(isBuiltInHistoryUrl(base, "wanted")).toBe(true)
    expect(historyFilterKey(base)).toBe(historyFilterKey(next))
    expect(historyFilterKey(base)).not.toBe(historyFilterKey(next.replace("limit=10", "limit=20")))
    const result = historyPagination(doc(`<nav aria-label="페이지"><strong aria-current="page">1</strong><a rel="next" href="${next}">다음</a></nav>`), "wanted", base)
    expect(result).toMatchObject({ currentPage: 1, pageSize: 10, hasNextPage: true })
    expect(result.next?.getAttribute("href")).toBe(next)
    expect(historyPagination(doc(""), "wanted", next).currentPage).toBe(2)
    expect(historyPagination(doc(""), "wanted", next.replace("page=2", "page=3")).currentPage).toBeUndefined()
  })
  it("페이지 영역의 숫자 버튼도 실제 컨트롤 그대로 사용한다", () => {
    const result = historyPagination(doc('<nav aria-label="페이지"><button>1</button><button aria-current="page">2</button><button>3</button></nav>'), "wanted", "https://www.wanted.co.kr/status/applications/applied?page=2&offset=10&limit=10")
    expect(result.currentPage).toBe(2)
    expect(result.first?.textContent).toBe("1")
    expect(result.next?.textContent).toBe("3")
  })
  it("사용자가 제공한 두 URL을 지원 현황으로 인식한다", () => {
    expect(isBuiltInHistoryUrl(first, "saramin")).toBe(true)
    expect(isBuiltInHistoryUrl(second, "saramin")).toBe(true)
    expect(isBuiltInHistoryUrl(first.replace("/page/1?", "/page/anything?"), "saramin")).toBe(false)
    expect(isBuiltInHistoryUrl(first.replace("www.saramin.co.kr", "evil.example"), "saramin")).toBe(false)
  })
  it("경로와 쿼리 번호가 다르면 화면의 현재 페이지를 우선하고 다음 링크를 그대로 쓴다", () => {
    const result = historyPagination(doc(`<nav aria-label="페이지"><strong aria-current="page">1</strong><a href="${second}">2</a></nav>`), "saramin", first)
    expect(result.currentPage).toBe(1)
    expect(result.next?.getAttribute("href")).toBe(second)
    expect(result.scope).toBe("2026-09-19 ~ 2026-10-19 · 1페이지")
    expect(result.pageSize).toBe(20)
    expect(result.totalPages).toBeUndefined()
  })
  it("화면 근거가 없으면 충돌하는 번호를 임의로 선택하지 않는다", () => {
    const result = historyPagination(doc("<main>지원 현황</main>"), "saramin", first)
    expect(result.currentPage).toBeUndefined()
    expect(result.scope).toContain("페이지 번호 확인 필요")
  })
  it("조회 조건이 다른 링크는 다음 페이지로 사용하지 않는다", () => {
    const result = historyPagination(doc(`<a rel="next" href="${second.replace("read_status=tot", "read_status=read")}">다음</a>`), "saramin", first)
    expect(result.hasNextPage).toBe(false)
    expect(historyFilterKey(first)).toBe(historyFilterKey(second))
    expect(historyFilterKey(first)).not.toBe(historyFilterKey(second.replace("read_status=tot", "read_status=read")))
  })
  it("현재 번호·마지막 페이지·비활성 다음 버튼을 구별한다", () => {
    const base = "https://www.jobkorea.co.kr/User/ApplyMng?page=3"
    const result = historyPagination(doc('<nav aria-label="페이지"><a href="?page=1">1</a><a href="?page=2">2</a><strong aria-current="page">3</strong><button aria-label="다음 페이지" disabled>다음</button></nav>'), "jobkorea", base)
    expect(result).toMatchObject({ currentPage: 3, hasNextPage: false, hasFirstPage: true, endKnown: true })
  })
  it("외부 호스트·지원 현황 밖 링크·임의 버튼은 클릭 대상으로 쓰지 않는다", () => {
    const result = historyPagination(doc('<a rel="next" href="https://evil.example/User/ApplyMng?page=2">다음</a><a href="/Recruit/GI_Read/12345678">2</a><button>다음</button>'), "jobkorea", "https://www.jobkorea.co.kr/User/ApplyMng?page=1")
    expect(result.hasNextPage).toBe(false)
  })
})
