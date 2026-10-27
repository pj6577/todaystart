import { describe, it, expect } from "vitest"
import { SaraminAdapter } from "../../src/platforms/saramin"
import { JobkoreaAdapter } from "../../src/platforms/jobkorea"
import { fixture, fixtureProfile } from "../helpers"
import { parseHistory } from "../../src/platforms/parser"

const doc = (html: string) => new DOMParser().parseFromString(html, "text/html")
describe("독립 플랫폼 DOM 파서", () => {
  it("사람인 fixture에서 상태와 직무를 수집한다", () => {
    const result = new SaraminAdapter(fixtureProfile("saramin")).collect(doc(fixture("saramin-history.html")))
    expect(result.records).toHaveLength(3)
    expect(result.records[0]).toMatchObject({ companyName: "주식회사 헌터협회", appliedAt: "2026-10-10", status: "applied", sourceApplicationId: "s-100" })
    expect(result.records[0]?.jobUrl).not.toContain("token")
    expect(result.records[2]).toMatchObject({ status: "cancelled", appliedAt: undefined })
  })
  it("잡코리아 fixture에서 별도 선택자를 사용한다", () => {
    const result = new JobkoreaAdapter(fixtureProfile("jobkorea")).collect(doc(fixture("jobkorea-history.html")))
    expect(result.records).toHaveLength(2)
    expect(result.records[0]).toMatchObject({ platform: "jobkorea", companyName: "(주)달빛연구소", status: "applied", appliedAt: "2026-10-12" })
  })
  it("프로필이 없으면 추측한 선택자로 수집하지 않는다", () => expect(new SaraminAdapter().collect(doc(fixture("saramin-history.html"))).code).toBe("selectors_unverified"))
  it.each([["<div id='s-login-required'></div>", "login_required"], ["<div id='s-loading'></div>", "loading"], ["<div id='s-history'><p id='s-empty'></p></div>", "empty"], ["<div id='s-history'></div>", "dom_changed"], ["<main></main>", "dom_changed"]])("예외 상태 %s", (html, code) => expect(new SaraminAdapter(fixtureProfile("saramin")).collect(doc(html)).code).toBe(code))
  it("일부 기간과 다음 페이지가 있으면 부분 수집을 알린다", () => {
    const html = fixture("saramin-history.html").replace('id="s-next" disabled', 'id="s-next"')
    const result = parseHistory(doc(html), fixtureProfile("saramin"), "https://www.saramin.co.kr")
    expect(result).toMatchObject({ code: "partial", hasNextPage: true, scope: "2026.10.01 ~ 2026.10.19 · 1페이지" })
  })
  it("날짜와 지원 ID가 모두 없으면 임의 기록을 만들지 않는다", () => {
    const html = '<div id="s-history"><article class="s-application"><span class="s-company">헌터협회</span><a class="s-title">개발자</a></article></div>'
    const result = new SaraminAdapter(fixtureProfile("saramin")).collect(doc(html))
    expect(result.records).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })
  it("지원 클릭이나 본문 문구만으로 성공을 추정하지 않는다", () => {
    const adapter = new SaraminAdapter(fixtureProfile("saramin"))
    expect(adapter.detectApplicationSuccess(doc("<button>지원 완료</button><p>입사지원이 완료되었습니다</p>"))).toBe(false)
    expect(adapter.detectApplicationSuccess(doc('<div id="s-success">입사지원이 완료되었습니다</div>'))).toBe(true)
  })
  it("공식 사람인 지원 URL을 감지하고 다른 도메인은 거절한다", () => {
    expect(new SaraminAdapter().isApplicationHistoryPage("https://www.saramin.co.kr/zf_user/persons/apply-status-list")).toBe(true)
    expect(new SaraminAdapter().isApplicationHistoryPage("https://evil.com/zf_user/persons/apply-status-list")).toBe(false)
  })
  it.each([
    ["https://www.jobkorea.co.kr/User/ApplyMng", true],
    ["https://www.jobkorea.co.kr/User/ApplyMng?period=3", true],
    ["https://www.jobkorea.co.kr/user/applymng/", true],
    ["https://www.jobkorea.co.kr/User/ApplyMngOther", false],
    ["https://evil.com/User/ApplyMng", false],
    ["https://www.jobkorea.co.kr.evil.com/User/ApplyMng", false],
    ["http://www.jobkorea.co.kr/User/ApplyMng", false]
  ])("사용자가 제공한 잡코리아 지원 경로 %s", (url, expected) => {
    expect(new JobkoreaAdapter().isApplicationHistoryPage(url)).toBe(expected)
  })
  it("별도 Profile이 있어도 알려진 잡코리아 지원 경로를 감지한다", () => {
    expect(new JobkoreaAdapter(fixtureProfile("jobkorea")).isApplicationHistoryPage("https://www.jobkorea.co.kr/User/ApplyMng")).toBe(true)
    expect(new JobkoreaAdapter().collect(doc(fixture("jobkorea-history.html"))).code).toBe("selectors_unverified")
  })
})
