import { describe, expect, it } from "vitest"
import { applicationReadingStats, dashboardStats, sharePercent } from "../../src/ui/dashboard-stats"
import { record } from "../helpers"

describe("dashboard statistics", () => {
  it("includes confirmed rejections inside the dashboard reading count without double counting", () => {
    const records = [
      record({ platform: "wanted", sourceStatus: "불합격", readStatus: "read" }),
      record({ platform: "remember", sourceStatus: "불합격", readStatus: "unknown" }),
      record({ platform: "remember", sourceStatus: "서류 불합격", readStatus: "unread" }),
      record({ readStatus: "read" }), record({ readStatus: "unread" }), record(),
      record({ status: "cancelled", sourceStatus: "불합격" }),
      record({ status: "pending_confirmation", sourceStatus: "불합격" })
    ]
    const stats = applicationReadingStats(records)
    expect(stats).toEqual({ total: 6, read: 4, unread: 1, rejected: 3, unknown: 1 })
    expect(stats.read + stats.unread + stats.unknown).toBe(stats.total)
    expect(stats.rejected).toBeLessThanOrEqual(stats.read)
    expect(records[1]?.readStatus).toBe("unknown")
    expect(records[2]?.readStatus).toBe("unread")
  })
  it("uses only explicit rejection outcomes, not job titles or unconfirmed labels", () => {
    expect(applicationReadingStats([
      record({ jobTitle: "불합격 데이터 분석", sourceStatus: "지원 접수", readStatus: "read" }),
      record({ sourceStatus: "불합격 여부 미확인", readStatus: "unread" }),
      record({ sourceStatus: "불합격 아님" })
    ])).toEqual({ total: 3, read: 1, unread: 1, rejected: 0, unknown: 1 })
    expect(applicationReadingStats([])).toEqual({ total: 0, read: 0, unread: 0, rejected: 0, unknown: 0 })
  })
  it("counts completed applications across all sources and excludes other states", () => {
    const records = [record(), record({ platform: "jobkorea" }), record({ platform: "wanted" }), record({ platform: "manual" }), record({ status: "cancelled" }), record({ status: "pending_confirmation" }), record({ status: "unknown" })]
    const stats = dashboardStats(records, "2026-10-20", "months")
    expect(stats.total).toBe(4)
    expect(stats.sources.map(source => [source.platform, source.count])).toEqual([["saramin", 1], ["jobkorea", 1], ["wanted", 1], ["manual", 1]])
    expect(stats.sources.map(source => sharePercent(source.count, stats.total))).toEqual([25, 25, 25, 25])
  })
  it("uses only valid application dates, never resume creation or collection timestamps", () => {
    const stats = dashboardStats([record({ appliedAt: undefined, sourceCreatedAt: "2026-10-19T12:00:00Z" }), record({ appliedAt: "2026-02-30" }), record({ appliedAt: "2026-10-19" })], "2026-10-20", "months")
    expect(stats).toMatchObject({ total: 3, dated: 1, undated: 2, periodTotal: 1 })
    expect(stats.weekdays.map(day => day.count)).toEqual([1, 0, 0, 0, 0, 0, 0])
  })
  it("only lists recorded completed paths and keeps manually entered sites separate", () => {
    const records = [record({ platform: "manual", sourceLabel: "리멤버", appliedAt: "2026-10-19" }), record({ platform: "manual", sourceLabel: "리멤버", appliedAt: "2026-10-20" }), record({ platform: "manual", sourceLabel: "점핏" }), record({ platform: "manual", sourceLabel: "기업 홈페이지" }), record({ platform: "jobkorea", status: "cancelled" })]
    const all = dashboardStats(records, "2026-10-20", "days")
    expect(all.sources).toEqual([{ platform: "manual:리멤버", count: 2 }, { platform: "manual:점핏", count: 1 }, { platform: "manual:기업 홈페이지", count: 1 }])
    expect(all.sources.reduce((sum, item) => sum + item.count, 0)).toBe(all.total)
    expect(dashboardStats(records, "2026-10-20", "days", "manual:리멤버")).toMatchObject({ total: 2, periodTotal: 2 })
    expect(dashboardStats([], "2026-10-20", "days").sources).toEqual([])
  })
  it("fills empty months across year boundaries and limits the current month to today", () => {
    const stats = dashboardStats([record({ appliedAt: "2025-08-31" }), record({ appliedAt: "2025-09-01" }), record({ appliedAt: "2026-02-10" }), record({ appliedAt: "2026-02-11" })], "2026-02-10", "months")
    expect(stats.bins.map(bin => [bin.key, bin.count])).toEqual([["2025-09", 1], ["2025-10", 0], ["2025-11", 0], ["2025-12", 0], ["2026-01", 0], ["2026-02", 1]])
    expect(stats.periodTotal).toBe(2)
    expect(stats.weekdays.reduce((sum, day) => sum + day.count, 0)).toBe(2)
  })
  it("filters every temporal series by source while using the same period for weekdays", () => {
    const records = [record({ platform: "saramin", appliedAt: "2026-10-19" }), record({ platform: "saramin", appliedAt: "2026-09-01" }), record({ platform: "jobkorea", appliedAt: "2026-10-20" }), record({ platform: "wanted", appliedAt: undefined })]
    const stats = dashboardStats(records, "2026-10-20", "days", "saramin")
    expect(stats).toMatchObject({ total: 2, dated: 2, periodTotal: 1, undated: 0 })
    expect(stats.bins.find(bin => bin.key === "2026-10-19")?.count).toBe(1)
    expect(stats.bins.find(bin => bin.key === "2026-10-20")?.count).toBe(0)
    expect(stats.weekdays.map(day => day.count)).toEqual([1, 0, 0, 0, 0, 0, 0])
    expect(dashboardStats(records, "2026-10-20", "days", "manual")).toMatchObject({ total: 0, dated: 0, periodTotal: 0 })
  })
  it("includes both boundaries of the last 30 days, including leap day, and handles empty data", () => {
    const stats = dashboardStats([record({ appliedAt: "2024-01-31" }), record({ appliedAt: "2024-02-01" }), record({ appliedAt: "2024-02-29" }), record({ appliedAt: "2024-03-01" })], "2024-03-01", "days")
    expect(stats.bins).toHaveLength(30)
    expect(stats.start).toBe("2024-02-01")
    expect(stats.periodTotal).toBe(3)
    expect(stats.bins[28]).toMatchObject({ key: "2024-02-29", count: 1 })
    expect(dashboardStats([], "2026-10-20", "days")).toMatchObject({ total: 0, dated: 0, undated: 0, periodTotal: 0 })
    expect(sharePercent(1, 3)).toBe(33.3)
    expect(sharePercent(0, 0)).toBe(0)
  })
})
