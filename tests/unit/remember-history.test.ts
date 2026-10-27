import { afterEach, expect, it } from "vitest"
import { fixture } from "../helpers"
import { DomPlatformAdapter } from "../../src/platforms/adapter"
import { parseBuiltInHistory } from "../../src/platforms/history"
import { historyContextUrl, historyFilterKey, historyPagination } from "../../src/platforms/history-pagination"
import { platformForUrl } from "../../src/core/urls"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"
import { syncCollection } from "../../src/collection/sync"
import { CompanyMatcher } from "../../src/core/company"
import { applicationReadingStats, dashboardStats } from "../../src/ui/dashboard-stats"

const url = "https://profile.rememberapp.co.kr/applies"
const databases: TodayStartDatabase[] = []
function doc(html = fixture("remember-history.html"), base = url) {
  const document = new DOMParser().parseFromString(html, "text/html")
  Object.defineProperty(document, "URL", { value: base })
  return document
}
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())) })

it("reads only the five supplied receipts, not summary counts or recommendations", () => {
  const result = parseBuiltInHistory(doc(), "remember")
  expect(result).toMatchObject({ code: "partial", skipped: 0, hasNextPage: false })
  expect(result.records).toHaveLength(5)
  expect(result.records[0]).toMatchObject({ platform: "remember", companyName: "(주)포페런츠", jobTitle: "Product Engineer", appliedAt: "2026-10-14", status: "applied", sourceStatus: "지원 접수", readStatus: "read", evidence: "history_page" })
  expect(result.records[1]).toMatchObject({ companyName: "(주)에이든랩", appliedAt: "2026-10-06", readStatus: "unknown" })
  expect(result.records.map(record => record.readStatus)).toEqual(["read", "unknown", "read", "unknown", "read"])
  expect(applicationReadingStats(result.records).rejected).toBe(0)
  for (const record of result.records) { expect(record.sourceApplicationId).toBeUndefined(); expect(record.sourceJobId).toBeUndefined(); expect(record.jobUrl).toBeUndefined() }
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|추천 기업/)
})
it("survives regenerated CSS hashes and keeps IDs stable as read/rejection status changes", () => {
  const before = parseBuiltInHistory(doc(), "remember").records
  const changed = fixture("remember-history.html").replace(/class="[^"]*"/g, 'class="regenerated"').replaceAll(">열람<", ">불합격<")
  const after = parseBuiltInHistory(doc(changed), "remember").records
  expect(after.map(record => record.id)).toEqual(before.map(record => record.id))
  expect(after[0]).toMatchObject({ sourceStatus: "불합격", status: "applied", readStatus: "unknown" })
  expect(applicationReadingStats(after)).toEqual({ total: 5, read: 3, unread: 0, rejected: 3, unknown: 2 })
})
it("does not interpret cancel actions or title text as status, and reads explicit badges", () => {
  const html = fixture("remember-history.html").replace("Product Engineer", "불합격 지원 취소 열람 개발자").replaceAll(">열람<", ">지원 취소<").replaceAll("<button>자세히 보기</button>", "<button>지원 취소</button><button>자세히 보기</button>")
  const records = parseBuiltInHistory(doc(html), "remember").records
  expect(records[0]).toMatchObject({ status: "cancelled", sourceStatus: "지원 취소" })
  expect(records[1]).toMatchObject({ status: "applied", sourceStatus: "지원 접수", readStatus: "unknown" })
})
it("skips malformed receipts and hidden rows without inventing dates", () => {
  const html = fixture("remember-history.html").replace("2026.10.14", "2026.02.30").replace("(주)에이든랩", "").replace("<h4>주니어", "<h4 hidden>주니어").replace("<article class=", "<article hidden class=")
  const result = parseBuiltInHistory(doc(html), "remember")
  expect(result.records.every(record => !!record.appliedAt)).toBe(true)
  expect(result.records.some(record => record.companyName === "(주)포페런츠")).toBe(false)
  expect(result.skipped).toBeGreaterThan(0)
})
it("limits collection to the exact HTTPS profile history route", () => {
  const adapter = new DomPlatformAdapter("remember")
  expect(platformForUrl(url)).toBe("remember")
  expect(adapter.isApplicationHistoryPage(url + "/?page=1")).toBe(true)
  for (const base of ["https://profile.rememberapp.co.kr/applies/123", "https://profile.rememberapp.co.kr/", "https://rememberapp.co.kr/applies", "https://profile.rememberapp.co.kr.evil.example/applies", "http://profile.rememberapp.co.kr/applies"]) {
    expect(adapter.isApplicationHistoryPage(base)).toBe(false)
    expect(parseBuiltInHistory(doc(undefined, base), "remember").records).toHaveLength(0)
  }
})
it("keeps the end unknown without inspected navigation and preserves visible filter context", () => {
  const d = doc(), original = historyFilterKey(historyContextUrl(d, "remember"))
  expect(historyPagination(d, "remember")).toMatchObject({ currentPage: 1, hasNextPage: false, endKnown: false })
  d.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked = true
  expect(historyFilterKey(historyContextUrl(d, "remember"))).not.toBe(original)
  d.querySelector('[aria-haspopup="listbox"]')!.textContent = "최근 1개월"
  expect(historyPagination(d, "remember").scope).toContain("최근 1개월")
})
it("follows actual semantic page links without losing site filters", () => {
  const d = doc(fixture("remember-history.html").replace("</main>", '<nav aria-label="페이지"><strong aria-current="page">1</strong><a href="?page=2">2</a><a href="?page=2" rel="next">다음</a></nav></main>'))
  expect(historyPagination(d, "remember")).toMatchObject({ currentPage: 1, hasNextPage: true, endKnown: false })
  expect(historyPagination(d, "remember").next?.getAttribute("href")).toBe("?page=2")
  const last = doc(fixture("remember-history.html").replace("</main>", '<nav aria-label="페이지"><strong aria-current="page">1</strong><button aria-label="다음 페이지" disabled>다음</button></nav></main>'))
  expect(historyPagination(last, "remember").endKnown).toBe(true)
})
it("merges repeated imports, preserves different receipt dates, restores backup and matches across sites", async () => {
  const db = new TodayStartDatabase("remember-" + crypto.randomUUID()); databases.push(db)
  const repo = new ApplicationRepository(db), result = parseBuiltInHistory(doc(), "remember")
  expect(await syncCollection(repo, "remember", result)).toMatchObject({ inserted: 5, collected: 5 })
  expect(await syncCollection(repo, "remember", parseBuiltInHistory(doc(), "remember"))).toMatchObject({ inserted: 0, updated: 5 })
  await syncCollection(repo, "remember", parseBuiltInHistory(doc(fixture("remember-history.html").replace("2026.10.14", "2026.10.15")), "remember"))
  expect(await repo.list()).toHaveLength(6)
  const matches = new CompanyMatcher(await repo.list(), false).find({ platform: "jobkorea", companyName: "포페런츠", jobTitle: "다른 개발 직무" }, false)
  expect(matches).toHaveLength(2)
  expect(dashboardStats(await repo.list(), "2026-10-21", "days", "remember").total).toBe(6)
  const backup = await repo.backup()
  const restoredDb = new TodayStartDatabase("remember-restored-" + crypto.randomUUID()); databases.push(restoredDb)
  const restored = new ApplicationRepository(restoredDb)
  await restored.restore(backup)
  expect(await restored.list()).toHaveLength(6)
})
