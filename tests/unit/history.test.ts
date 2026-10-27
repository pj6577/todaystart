import { describe, it, expect } from "vitest"
import { fixture } from "../helpers"
import { parseBuiltInHistory } from "../../src/platforms/history"
import { historyDiagnostics } from "../../src/platforms/history-diagnostics"

const url = "https://www.jobkorea.co.kr/User/ApplyMng"
function doc(html = fixture("semantic-history.html"), base = url) {
  const document = new DOMParser().parseFromString(html, "text/html")
  Object.defineProperty(document, "URL", { value: base })
  return document
}
describe("지원 현황 기본 의미 구조 파서 — 실제 로그인 DOM 검증과 구분", () => {
  it("원티드 경로에서 기업·공고 링크와 지원일을 읽는다 (합성 구조)", () => {
    const html = '<main><ul><li><a href="/company/79">가상기업</a><a href="/wd/22942">웹 개발자</a><p>지원일 2026.10.19</p><span>지원 완료</span></li></ul></main>'
    const result = parseBuiltInHistory(doc(html, "https://www.wanted.co.kr/status/applications/applied?q&start_date=&end_date=&page=1&offset=0&limit=10"), "wanted")
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({ platform: "wanted", sourceJobId: "22942", companyName: "가상기업", appliedAt: "2026-10-19", status: "applied" })
  })
  it("선택자 파일 없이 열 이름으로 수집하고 취소 버튼은 상태로 오인하지 않는다", () => {
    const result = parseBuiltInHistory(doc(), "jobkorea")
    expect(result.records).toHaveLength(2)
    expect(result.records[0]).toMatchObject({ companyName: "가상기업 알파", jobTitle: "프론트엔드 개발자", appliedAt: "2026-10-19", status: "applied" })
    expect(result.records[0]!.jobUrl).not.toContain("token")
    expect(result.records[1]).toMatchObject({ appliedAt: "2026-10-18", status: "cancelled" })
  })
  it("추천 공고와 마감일만 있는 카드는 수집하지 않는다", () => {
    const result = parseBuiltInHistory(doc(fixture("semantic-history.html").replace(/<table>[\s\S]*?<\/table>/, "")), "jobkorea")
    expect(result.records).toHaveLength(0)
    expect(result.code).toBe("selectors_unverified")
  })
  it("사람인 기업/공고 링크와 명시적 지원일로 카드 구조를 읽는다", () => {
    const d = doc('<main><ul><li><a href="/zf_user/company-info/view?csn=EXAMPLE">가상기업</a><a href="/zf_user/jobs/relay/view?rec_idx=12345678">웹 개발자</a><p>지원일 2026.10.19</p><span>미열람</span><button>지원취소</button></li></ul></main>', "https://www.saramin.co.kr/zf_user/persons/apply-status-list")
    expect(parseBuiltInHistory(d, "saramin").records).toHaveLength(1)
    expect(parseBuiltInHistory(d, "saramin").records[0]?.status).toBe("applied")
  })
  it("다른 경로·다른 호스트에서는 같은 표가 있어도 수집하지 않는다", () => {
    expect(parseBuiltInHistory(doc(undefined, "https://www.jobkorea.co.kr/Recruit/Joblist"), "jobkorea").records).toHaveLength(0)
    expect(parseBuiltInHistory(doc(undefined, "https://evil.example/User/ApplyMng"), "jobkorea").records).toHaveLength(0)
  })
  it("여러 공고가 섞인 상위 컨테이너를 하나의 기록으로 만들지 않는다", () => {
    const html = '<main><section><a href="/Recruit/Co_Read/C/123">가상기업</a><a href="/Recruit/GI_Read/12345678">개발자</a><a href="/Recruit/GI_Read/87654321">디자이너</a><p>지원일 2026.10.19</p></section></main>'
    expect(parseBuiltInHistory(doc(html), "jobkorea").records).toHaveLength(0)
  })
  it("잘못된 날짜와 숨김 행을 제외하고 날짜를 생성하지 않는다", () => {
    const html = fixture("semantic-history.html").replace("2026.10.19", "2026.02.30").replace("<tr><td>가상기업 베타", "<tr hidden><td>가상기업 베타")
    expect(parseBuiltInHistory(doc(html), "jobkorea").records).toHaveLength(0)
  })
  it("일반 로그인 버튼만으로 로그인 필요로 오인하지 않는다", () => {
    expect(parseBuiltInHistory(doc(fixture("semantic-history.html") + '<a href="/Login">로그인</a>'), "jobkorea").records).toHaveLength(2)
    expect(parseBuiltInHistory(doc("<p>로그인이 필요한 페이지 입니다.</p>"), "jobkorea").code).toBe("login_required")
  })
  it("빈 화면의 로그인 메뉴·숨은 로그인 안내는 로그인 실패의 근거가 아니다", () => {
    for (const html of [
      '<main><p>불러오는 중</p><a href="/Login">로그인</a></main>',
      '<main><p>불러오는 중</p><div hidden>로그인이 필요한 페이지 입니다.</div></main>',
      '<main><p>불러오는 중</p><div style="display:none">개인회원 로그인</div></main>',
      '<main><p>불러오는 중</p></main><footer>로그인 후 이용해 주세요</footer>'
    ]) expect(parseBuiltInHistory(doc(html), "jobkorea").code).toBe("selectors_unverified")
  })
  it("진단은 구조만 남기고 계정·지원 내용·식별자·입력값·스크립트를 제거한다", () => {
    const diagnostic = historyDiagnostics(doc(fixture("semantic-history.html") + '<script>SECRET_TOKEN</script><input value="PRIVATE_VALUE">'), "jobkorea")
    const serialized = JSON.stringify(diagnostic)
    for (const value of ["TEST_PRIVATE_ACCOUNT", "가상기업 알파", "프론트엔드 개발자", "SECRET_TOKEN", "PRIVATE_VALUE", "12345678", "SECRET"]) expect(serialized).not.toContain(value)
    expect(diagnostic.html).toContain("<table>")
    expect(diagnostic.headings).toContain("지원일")
    expect(diagnostic.parsing).toMatchObject({ recognized: 2, skipped: 0 })
    expect(diagnostic.tables[0]).toMatchObject({ inObservedRoot: true, rows: 2 })
    expect(diagnostic.tables[0]?.rowShapes[0]).toMatchObject({ cells: 4, visibleText: true, jobLinks: 1 })
  })
  it.each([
    ["jobkorea", "https://www.jobkorea.co.kr/User/ApplyMng?Page=1#"],
    ["saramin", "https://www.saramin.co.kr/zf_user/persons/apply-status-list"]
  ] as const)("%s에서 미인식된 목록 밖 중첩 페이지 컨트롤도 진단한다", (platform, base) => {
    const d = doc('<main><p>PRIVATE_ACCOUNT</p></main><footer><div class="custom-pagination"><span class="selected"><em>1</em></span><span><a href="javascript:move(2,\'SECRET_TOKEN\')" onclick="PRIVATE_HANDLER()">2</a></span><button title="SECRET_TITLE" onclick="PRIVATE_HANDLER()"><img alt="다음 페이지" src="/PRIVATE_IMAGE"></button><button disabled>마지막 페이지</button></div></footer>', base)
    const diagnostic = historyDiagnostics(d, platform)
    expect(diagnostic.pagination.hasNextPage).toBe(false)
    expect(diagnostic.navigationCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: "a", number: 2, linkKind: "script", hasClickHandler: true, inPageContext: true }),
      expect.objectContaining({ tag: "button", label: "다음 페이지" }),
      expect.objectContaining({ tag: "button", label: "마지막 페이지", disabled: true })
    ]))
    expect(diagnostic.navigationCandidates.find(candidate => candidate.number === 2)?.ancestry).toEqual(expect.arrayContaining([expect.objectContaining({ classes: "custom-pagination" })]))
    for (const value of ["PRIVATE_ACCOUNT", "SECRET_TOKEN", "PRIVATE_HANDLER", "SECRET_TITLE", "PRIVATE_IMAGE"]) expect(JSON.stringify(diagnostic)).not.toContain(value)
  })
  it("페이지 URL은 페이지 숫자만, 셀의 날짜는 형식만 진단한다", () => {
    const d = doc(fixture("semantic-history.html") + '<a href="?Page=2&From_Dt=2026-10-19&account=PRIVATE_ACCOUNT&token=SECRET_TOKEN">다음</a>')
    const diagnostic = historyDiagnostics(d, "jobkorea")
    expect(diagnostic.navigationCandidates.find(candidate => candidate.label === "다음")?.pageParameters).toEqual({ page: 2 })
    expect(diagnostic.tables[0]?.rowShapes[0]?.cellShapes.some(cell => cell.dateFormats.includes("0000.00.00"))).toBe(true)
    const { capturedAt, ...structureOnly } = diagnostic
    for (const value of ["2026-10-19", "2026.10.19", "PRIVATE_ACCOUNT", "SECRET_TOKEN"]) expect(JSON.stringify(structureOnly)).not.toContain(value)
  })
})
