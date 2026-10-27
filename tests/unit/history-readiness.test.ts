import { describe, expect, it } from "vitest"
import { HistoryReadiness } from "../../src/collection/history-readiness"
import type { CollectionResult } from "../../src/core/model"
import { record } from "../helpers"

const url = "https://www.wanted.co.kr/status/applications/applied?page=1&offset=0&limit=10"
const result: CollectionResult = { records: [], code: "selectors_unverified", message: "unrecognized", scope: "현재 조건", skipped: 0, hasNextPage: false }
describe("비동기 지원 목록 대기", () => {
  it("아직 없는 목록을 실패로 저장하지 않고, 준비되면 즉시 읽는다", () => {
    const readiness = new HistoryReadiness()
    expect(readiness.review(result, url, false, 0).code).toBe("loading")
    expect(readiness.review(result, url, false, 20000).code).toBe("loading")
    const ready = { ...result, code: "partial" as const, records: [record()] }
    expect(readiness.review(ready, url, false, 22000)).toBe(ready)
  })
  it("45초 후에도 안 읽히면 빈 목록/완료로 취급하지 않는다", () => {
    const readiness = new HistoryReadiness(); readiness.reset(url, 0)
    expect(readiness.review(result, url, false, 45001)).toMatchObject({ code: "selectors_unverified", records: [] })
    expect(readiness.review({ ...result, code: "loading" }, url, false, 45001).code).toBe("error")
  })
  it("페이지 변경과 명시적 재시도는 대기 시간을 새로 시작한다", () => {
    const readiness = new HistoryReadiness(); readiness.reset(url, 0)
    expect(readiness.review(result, url, false, 46000).code).toBe("selectors_unverified")
    expect(readiness.review(result, url.replace("page=1", "page=2"), false, 47000).code).toBe("loading")
    readiness.reset(url, 90000)
    expect(readiness.review(result, url, false, 90000).code).toBe("loading")
  })
  it("로딩 표시가 있는 이전 행은 저장하지 않고 로그인/명시적 빈 상태는 구분한다", () => {
    const readiness = new HistoryReadiness(); readiness.reset(url, 0)
    expect(readiness.review({ ...result, code: "partial", records: [record()] }, url, true, 1000)).toMatchObject({ code: "loading", records: [] })
    expect(readiness.review({ ...result, code: "login_required" }, url, true, 1000).code).toBe("login_required")
    expect(readiness.review({ ...result, code: "empty" }, url, false, 1000).code).toBe("empty")
  })
})
