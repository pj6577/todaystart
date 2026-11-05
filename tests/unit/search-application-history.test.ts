import { describe, expect, it } from "vitest"
import { applicationHistoryIndex, searchCompanyNameKey } from "../../src/search/application-history"
import { normalizeCompanyName } from "../../src/core/company"
import { record } from "../helpers"

describe("통합검색의 로컬 지원 기업 비교", () => {
  it("회사·서비스명 병기도 양방향으로 완료 이력을 찾고 저장 이름은 유지한다", () => {
    const records = [
      record({ id: "base", companyName: "(주)워시스왓", jobTitle: "Frontend Engineer", appliedAt: "2026-11-01" }),
      record({ id: "service", platform: "wanted", companyName: "워시스왓(세탁특공대)", appliedAt: "2026-11-04" }),
      record({ id: "pending", companyName: "워시스왓(세탁특공대)", status: "pending_confirmation" })
    ]
    const before = structuredClone(records), index = applicationHistoryIndex(records)
    for (const name of ["㈜워시스왓", "워시스왓(세탁특공대)"]) expect(index.get(searchCompanyNameKey(name))?.map(record => record.id)).toEqual(["service", "base"])
    expect(index.has(searchCompanyNameKey("워시스왓(부산지점)"))).toBe(false)
    expect(records).toEqual(before)
  })
  it("사이트·법인 표기가 달라도 완료된 지원만 묶고 최신 지원부터 보여준다", () => {
    const records = [
      record({ id: "old", platform: "saramin", companyName: "(주)예시 회사", appliedAt: "2026-09-01" }),
      record({ id: "new", platform: "manual", companyName: "예시회사 주식회사", appliedAt: "2026-10-20" }),
      record({ id: "cancel", companyName: "예시회사", status: "cancelled" }),
      record({ id: "pending", companyName: "예시회사", status: "pending_confirmation" }),
      record({ id: "unknown", companyName: "예시회사", status: "unknown" }),
      record({ id: "different", companyName: "예시회사홀딩스" })
    ]
    const index = applicationHistoryIndex(records)
    expect(index.get(normalizeCompanyName("㈜예시회사"))?.map(record => record.id)).toEqual(["new", "old"])
    expect(index.get(normalizeCompanyName("예시회사홀딩스"))?.map(record => record.id)).toEqual(["different"])
    expect(index.has(normalizeCompanyName("예시회샤"))).toBe(false)
    expect(records[0]!.id).toBe("old")
  })
  it.each(["아인잡(AINJOB)", "㈜아인잡", "아인잡 （ＡＩＮＪＯＢ）", "AINJOB(아인잡)", "(주)아인잡(Ainjob)", "아인잡(AINJOB) 주식회사"])("법인 표기와 한영 병기: %s", value => {
    expect(searchCompanyNameKey(value)).toBe("아인잡")
  })
  it("지원 기록과 공고의 병기 방향에 상관없이 같은 이력을 찾아 중복 없이 최신순으로 묶는다", () => {
    const records = [
      record({ id: "jobkorea", platform: "jobkorea", companyName: "㈜아인잡", appliedAt: "2026-10-20" }),
      record({ id: "wanted", platform: "wanted", companyName: "아인잡(AINJOB)", appliedAt: "2026-10-21" }),
      record({ id: "reverse", platform: "manual", companyName: "AINJOB(아인잡)", appliedAt: "2026-10-22" }),
      record({ id: "pending", companyName: "아인잡(AINJOB)", status: "pending_confirmation" }),
      record({ id: "cancelled", companyName: "㈜아인잡", status: "cancelled" })
    ]
    const original = structuredClone(records), index = applicationHistoryIndex(records)
    for (const name of ["㈜아인잡", "아인잡(AINJOB)", "AINJOB(아인잡)"]) expect(index.get(searchCompanyNameKey(name))?.map(record => record.id)).toEqual(["reverse", "wanted", "jobkorea"])
    expect(records).toEqual(original)
    expect(normalizeCompanyName("아인잡(AINJOB)")).toBe("아인잡(ainjob)")
  })
  it.each([
    "아인잡(부산)", "아인잡(부산지점)", "아인잡홀딩스", "아인잡(홀딩스)", "아인잡(AINJOB) 강남지점",
    "아인잡(AINJOB Korea)", "아인잡(Seoul)", "아인잡(USA)", "아인잡(Holdings)", "아인잡(Lab)",
    "아인잡(AI)", "AINJOB(서울)", "AINJOB(아인잡지점)", "다른기업(AINJOB)", "아인잡스(AINJOBS)",
    "아인잡(AINJOB/서울)", "아인잡(채용대행)", "아인잡(AINJOB)(부산)"
  ])("지점·계열사·부가 설명·다른 한글 이름은 섞지 않는다: %s", value => {
    const index = applicationHistoryIndex([record({ companyName: "㈜아인잡" })])
    expect(index.has(searchCompanyNameKey(value))).toBe(false)
  })
  it("괄호 없는 영문명과 철자 유사성만으로 연결하지 않는다", () => {
    const index = applicationHistoryIndex([record({ companyName: "㈜아인잡" })])
    for (const name of ["AINJOB", "아인쟙", "아인", "아인잡에이아이"]) expect(index.has(searchCompanyNameKey(name))).toBe(false)
    expect(searchCompanyNameKey(" ")).toBe("")
  })
})
