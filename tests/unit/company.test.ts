import { describe, it, expect } from "vitest"
import { normalizeCompanyName, compareCompanies, CompanyMatcher } from "../../src/core/company"
import { record } from "../helpers"

describe("기업 정규화와 오탐 방지", () => {
  it.each(["주식회사 헌터협회", "(주)헌터협회", "헌터 협회", "헌터협회(주)", "㈜헌터협회", "  헌터  협회  "])("법인 표기: %s", value => expect(normalizeCompanyName(value)).toBe("헌터협회"))
  it("Unicode와 대소문자를 정리한다", () => expect(normalizeCompanyName("ＡＣＭＥ Inc.")).toBe("acmeinc"))
  it.each(["헌터협회홀딩스", "헌터협회지주", "헌터협회자회사", "헌터협회(부산)"])("계열사와 지점을 동일시하지 않는다: %s", companyName => expect(compareCompanies({ companyName }, { companyName: "헌터협회" })).toBe("none"))
  it("다른 식별자면 이름이 같아도 불일치", () => expect(compareCompanies({ companyName: "헌터협회", companyIdentifier: "biz:1" }, { companyName: "헌터협회", companyIdentifier: "biz:2" })).toBe("none"))
  it("공통 식별자가 이름 차이보다 우선한다", () => expect(compareCompanies({ companyName: "구 기업명", companyIdentifier: "biz:1" }, { companyName: "신 기업명", companyIdentifier: "biz:1" })).toBe("exact"))
  it("사이트가 다르면 서로 다른 기업 ID로 같은 이름의 경고를 차단하지 않는다", () => {
    const matcher = new CompanyMatcher([record({ companyIdentifier: "123" })])
    expect(matcher.find({ platform: "jobkorea", companyName: "(주)헌터협회", companyIdentifier: "456", jobTitle: "개발자" })[0]?.confidence).toBe("probable")
  })
  it("사이트가 다르면 숫자가 같은 기업 ID만으로 다른 이름을 합치지 않는다", () => {
    const matcher = new CompanyMatcher([record({ companyIdentifier: "123" })])
    expect(matcher.find({ platform: "jobkorea", companyName: "전혀다른기업", companyIdentifier: "123", jobTitle: "개발자" })).toEqual([])
  })
  it("같은 사이트의 기업 ID 불일치는 이름이 같아도 유지한다", () => {
    const matcher = new CompanyMatcher([record({ companyIdentifier: "123" })])
    expect(matcher.find({ platform: "saramin", companyName: "헌터협회", companyIdentifier: "456", jobTitle: "개발자" }, true)).toEqual([])
  })
  it("빅링크의 잡코리아 이력은 같은 잡코리아의 다른 직무·공고에서도 표시한다", () => {
    const matcher = new CompanyMatcher([record({ platform: "jobkorea", companyName: "주식회사 빅링크", normalizedCompanyName: "빅링크", companyIdentifier: "jobkorea:example", sourceJobId: "70000001", jobTitle: "이전에 지원한 직무" })])
    const matches = matcher.find({ platform: "jobkorea", companyName: "㈜빅링크", sourceJobId: "50178270", jobTitle: "다른 채용 직무" })
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ confidence: "probable", record: { platform: "jobkorea", jobTitle: "이전에 지원한 직무" } })
  })
  it("사이트별 ID가 다른 경우에도 선택한 유사 이름 비교는 유지한다", () => {
    const matcher = new CompanyMatcher([record({ companyName: "헌터협희", normalizedCompanyName: "헌터협희", companyIdentifier: "123" })])
    expect(matcher.find({ platform: "jobkorea", companyName: "헌터협회", companyIdentifier: "456", jobTitle: "개발자" }, true)[0]?.confidence).toBe("possible")
  })
  it("정규화 이름은 probable로만 판정한다", () => expect(compareCompanies({ companyName: "(주)헌터협회" }, { companyName: "헌터 협회" })).toBe("probable"))
  it("Fuse 검색은 possible로만 표시하고 기본으로 끈다", () => {
    const matcher = new CompanyMatcher([record({ companyName: "헌터협희", normalizedCompanyName: "헌터협희" })])
    const posting = { platform: "jobkorea" as const, companyName: "헌터협회", jobTitle: "개발자" }
    expect(matcher.find(posting)).toHaveLength(0)
    expect(matcher.find(posting, true)[0]?.confidence).toBe("possible")
  })
  it("확인 대기/불명은 지원한 회사라고 경고하지 않는다", () => {
    const matcher = new CompanyMatcher([record({ status: "pending_confirmation" }), record({ status: "unknown" })])
    expect(matcher.find({ platform: "jobkorea", companyName: "헌터협회", jobTitle: "다른 직무" })).toEqual([])
  })
  it("취소 기록은 선택해서 표시한다", () => {
    const posting = { platform: "jobkorea" as const, companyName: "헌터협회", jobTitle: "개발자" }
    expect(new CompanyMatcher([record({ status: "cancelled" })]).find(posting)).toHaveLength(0)
    expect(new CompanyMatcher([record({ status: "cancelled" })], true).find(posting)).toHaveLength(1)
  })
})
