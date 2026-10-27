import { describe, expect, it } from "vitest"
import { inspectedFilters, inspectedHistory } from "../fixtures/inspected-history"
import { parseBuiltInHistory } from "../../src/platforms/history"
import { historyContextUrl, historyFilterKey, historyNavigationUrl, historyPagination } from "../../src/platforms/history-pagination"

function doc(platform: "jobkorea" | "saramin", page = 1, url?: string) {
  const d = new DOMParser().parseFromString(inspectedHistory(platform, page), "text/html")
  Object.defineProperty(d, "URL", { value: url || (platform === "jobkorea" ? "https://www.jobkorea.co.kr/User/ApplyMng?Page=1#" : "https://www.saramin.co.kr/zf_user/persons/apply-status-list") })
  return d
}

describe("사용자가 공유한 DOM 조사 구조의 재구성 회귀 검사", () => {
  it("기존 일반 파서에서 20행 중 8행만 읽히던 날짜 혼합을 재현한다", () => {
    const d = doc("jobkorea")
    d.querySelector(".applymng-list")!.classList.remove("applymng-list")
    d.querySelectorAll("td[colspan]").forEach(cell => cell.closest("tr")!.remove())
    expect(parseBuiltInHistory(d, "jobkorea").records).toHaveLength(8)
  }, 20000)
  it("잡코리아 지원행 20건을 읽고 추천공고·열람일·취소 버튼을 제외한다", () => {
    const d = doc("jobkorea"), result = parseBuiltInHistory(d, "jobkorea")
    expect(d.querySelectorAll("tbody tr")).toHaveLength(40)
    expect(result.records).toHaveLength(20)
    expect(result.skipped).toBe(0)
    expect(new Set(result.records.map(record => record.sourceApplicationId)).size).toBe(20)
    expect(result.records.every(record => record.appliedAt === "2026-10-01" && record.status === "applied" && !record.jobTitle.includes("(~"))).toBe(true)
    expect(result.records[0]).toMatchObject({ sourceApplicationId: "80000100", sourceJobId: "90000100", companyIdentifier: "70000100", jobTitle: "개발자 100", readStatus: "read" })
  })
  it("사람인 속성의 공고명과 지원일만 읽고 툴팁·이력 날짜를 제외한다", () => {
    const result = parseBuiltInHistory(doc("saramin"), "saramin")
    expect(result.records).toHaveLength(20)
    expect(result.records.every(record => record.appliedAt === "2026-10-01" && record.status === "applied" && /^개발자 \d+$/.test(record.jobTitle))).toBe(true)
    expect(result.records[0]).toMatchObject({ sourceApplicationId: "80000100", sourceJobId: "90000100", companyIdentifier: "70000100" })
    expect(result.records[0]?.readStatus).toBe("unread")
    expect(result.records[1]?.readStatus).toBe("unknown")
  })
  it.each(["jobkorea", "saramin"] as const)("%s 기본 URL에서 사이트가 추가한 기본 필터와 실제 다음/마지막 페이지를 읽는다", platform => {
    const d = doc(platform), pagination = historyPagination(d, platform)
    expect(pagination).toMatchObject({ currentPage: 1, hasNextPage: true, endKnown: false })
    expect(pagination.next?.getAttribute("data-page")).toBe("2")
    const target = new URL(pagination.next!.getAttribute("href")!, d.URL).href
    expect(historyFilterKey(historyContextUrl(d, platform))).toBe(historyFilterKey(target))
    if (platform === "jobkorea") expect(historyNavigationUrl(platform, d.URL, pagination, "NEXT_PAGE")).toBe(target)
    const last = doc(platform, 2, target), lastPagination = historyPagination(last, platform)
    expect(lastPagination).toMatchObject({ currentPage: 2, hasNextPage: false, hasFirstPage: true, endKnown: true })
    expect(historyFilterKey(historyContextUrl(last, platform))).toBe(historyFilterKey(target))
    expect(parseBuiltInHistory(last, platform).records).toHaveLength(platform === "jobkorea" ? 1 : 12)
  })
  it("명시한 날짜/상태와 다른 필터의 페이지 링크를 받아들이지 않는다", () => {
    const d = doc("jobkorea", 1, `https://www.jobkorea.co.kr/User/ApplyMng?${inspectedFilters.jobkorea.replace("ReadStat=0", "ReadStat=1")}&Page=1`)
    expect(historyContextUrl(d, "jobkorea")).toBe(d.URL)
    expect(historyPagination(d, "jobkorea").hasNextPage).toBe(false)
  })
})
