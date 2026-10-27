import { describe, expect, it, vi } from "vitest"
import { parseBuiltInHistory } from "../../src/platforms/history"
import { enrichWantedRecords, WantedHistoryReader, wantedRequestUrl } from "../../src/platforms/wanted-history"
import { historyPagination } from "../../src/platforms/history-pagination"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"
import { wantedInspectedHistory, wantedInspectedResponse } from "../fixtures/wanted-inspected-history"
import { applicationReadingStats } from "../../src/ui/dashboard-stats"

const url = "https://www.wanted.co.kr/status/applications/applied?page=1&offset=0&limit=10"
const api = "https://www.wanted.co.kr/api/v1/applications?user_id=100&page=1&offset=0&limit=10"
function doc(page = 1) {
  const d = new DOMParser().parseFromString(wantedInspectedHistory(page, false, true), "text/html")
  Object.defineProperty(d, "URL", { value: url.replace("page=1&offset=0", `page=${page}&offset=${(page - 1) * 10}`) })
  return d
}
describe("원티드 공유 조사 기반 DOM과 선택적 API 보강", () => {
  it("링크 없는 ul/li 행 2건을 읽고 작성일을 지원일로 저장하지 않는다", () => {
    const d = doc(), first = parseBuiltInHistory(d, "wanted"), again = parseBuiltInHistory(d, "wanted")
    expect(first.records).toHaveLength(2)
    expect(first.records.map(record => record.id)).toEqual(again.records.map(record => record.id))
    expect(first.records[0]).toMatchObject({ companyName: "가상원티드 10", jobTitle: "웹 개발자 10", sourceCreatedAt: "2026-09-11", sourceStatus: "불합격", readStatus: "unknown", status: "applied" })
    expect(first.records[0]?.appliedAt).toBeUndefined()
  })
  it("실제 라벨의 페이지 버튼과 비활성 다음 버튼으로 마지막을 판단한다", () => {
    expect(historyPagination(doc(), "wanted")).toMatchObject({ currentPage: 1, hasNextPage: true, endKnown: false })
    expect(historyPagination(doc(2), "wanted")).toMatchObject({ currentPage: 2, hasFirstPage: true, hasNextPage: false, endKnown: true })
  })
  it("현재 화면 행에만 API 지원 ID와 열람 여부를 보강하고 개인정보를 제거한다", () => {
    const records = parseBuiltInHistory(doc(), "wanted").records
    const enriched = enrichWantedRecords(records, wantedInspectedResponse())
    expect(enriched[0]).toMatchObject({ sourceApplicationId: "800010", sourceJobId: "600010", companyIdentifier: "700010", readStatus: "read", sourceCreatedAt: "2026-09-11T10:37:48" })
    expect(enriched[1]?.readStatus).toBe("unread")
    expect(applicationReadingStats(enriched)).toEqual({ total: 2, read: 2, unread: 0, rejected: 2, unknown: 0 })
    expect(enriched[0]?.appliedAt).toBeUndefined()
    for (const value of ["PRIVATE_RESUME", "PRIVATE_USER", "PRIVATE_EMAIL"]) expect(JSON.stringify(enriched)).not.toContain(value)
    expect(enrichWantedRecords(records, wantedInspectedResponse(2))).toEqual(records)
  })
  it("모호한 API 후보가 둘이면 ID나 열람 상태를 추정하지 않는다", () => {
    const payload = wantedInspectedResponse()
    payload.applications.push({ ...payload.applications[0]!, id: 999999 })
    expect(enrichWantedRecords(parseBuiltInHistory(doc(), "wanted").records, payload)[0]?.sourceApplicationId).toBeUndefined()
  })
  it("현재 페이지·검색·기간에 맞는 관찰된 동일 출처 주소만 사용한다", () => {
    expect(wantedRequestUrl([api], url)).toBe(api)
    for (const invalid of [api.replace("www.wanted.co.kr", "evil.example"), api.replace("applications?", "applications/other?"), api.replace("page=1", "page=2"), api.replace("offset=0", "offset=10")]) expect(wantedRequestUrl([invalid], url)).toBeUndefined()
    expect(wantedRequestUrl([api], url + "&q=filtered")).toBeUndefined()
    expect(wantedRequestUrl([api], url + "&start_date=2026-10-01")).toBeUndefined()
    expect(wantedRequestUrl([api], "https://www.wanted.co.kr/wd/1")).toBeUndefined()
  })
  it("API가 거절되면 DOM 기록을 그대로 반환하고 실패 요청을 반복하지 않는다", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 401 }))
    const reader = new WantedHistoryReader(() => [api], request), d = doc(), result = parseBuiltInHistory(d, "wanted")
    expect(await reader.read(d, result)).toEqual(result)
    expect(await reader.read(d, result)).toEqual(result)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(api, expect.objectContaining({ credentials: "include", redirect: "error" }))
  })
  it("네트워크 호출 자체가 예외를 던져도 DOM 수집을 유지한다", async () => {
    const reader = new WantedHistoryReader(() => [api], (() => { throw new Error("Network unavailable") }) as typeof fetch)
    const d = doc(), result = parseBuiltInHistory(d, "wanted")
    expect(await reader.read(d, result)).toEqual(result)
  })
  it("응답이 멈추면 5초에 중단하고 DOM 수집을 유지한다", async () => {
    vi.useFakeTimers()
    try {
      const request: typeof fetch = (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))
      const reader = new WantedHistoryReader(() => [api], request), d = doc(), result = parseBuiltInHistory(d, "wanted")
      const reading = reader.read(d, result)
      await vi.advanceTimersByTimeAsync(5000)
      expect(await reading).toEqual(result)
    } finally { vi.useRealTimers() }
  })
  it("DOM → API → DOM 재수집·백업 복원 시 같은 지원을 유지하며 열람 정보를 보존한다", async () => {
    const repository = new ApplicationRepository(new TodayStartDatabase("wanted-" + crypto.randomUUID()))
    try {
      const records = parseBuiltInHistory(doc(), "wanted").records
      await repository.merge(records)
      expect(await repository.merge(enrichWantedRecords(records, wantedInspectedResponse()))).toEqual({ inserted: 0, updated: 2 })
      await repository.merge(records)
      let saved = await repository.list()
      expect(saved).toHaveLength(2)
      expect(saved.find(record => record.sourceApplicationId === "800010")).toMatchObject({ readStatus: "read", sourceCreatedAt: "2026-09-11T10:37:48" })
      await repository.merge(enrichWantedRecords(records, wantedInspectedResponse(1, true)))
      expect((await repository.list()).every(record => record.readStatus === "read")).toBe(true)
      const backup = await repository.backup()
      await repository.db.applications.clear()
      await repository.restore(backup); await repository.restore(backup)
      saved = await repository.list()
      expect(saved).toHaveLength(2)
      expect(saved.every(record => !record.appliedAt && record.sourceCreatedAt && record.readStatus === "read")).toBe(true)
    } finally { await repository.db.delete() }
  })
})
