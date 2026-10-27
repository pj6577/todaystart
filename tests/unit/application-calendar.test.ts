import { describe, expect, it } from "vitest"
import { applicationCalendar, shiftCalendarMonth } from "../../src/ui/application-calendar-data"
import { record } from "../helpers"

describe("application calendar", () => {
  it("reserves six Monday-first weeks for every month and handles leap years", () => {
    const leap = applicationCalendar([], "2024-02", "2024-03-01")
    expect(leap.cells).toHaveLength(42)
    expect(applicationCalendar([], "2026-03", "2026-04-01").cells).toHaveLength(42)
    expect(applicationCalendar([], "2021-02", "2021-03-01").cells).toHaveLength(42)
    expect(leap.cells.slice(0, 3)).toEqual([null, null, null])
    expect(leap.cells.filter(Boolean)).toHaveLength(29)
    expect(applicationCalendar([], "2025-02", "2025-03-01").cells.filter(Boolean)).toHaveLength(28)
    expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12")
    expect(shiftCalendarMonth("2025-12", 1)).toBe("2026-01")
  })
  it("keeps the same date cells when the last week is empty or filtered out", () => {
    const records = [record({ appliedAt: "2021-05-01" }), record({ appliedAt: "2021-05-31" })]
    const dates = (entries: ReturnType<typeof applicationCalendar>) => entries.cells.map(cell => cell?.date ?? null)
    const empty = applicationCalendar([], "2021-05", "2021-05-31")
    expect(dates(applicationCalendar(records.slice(0, 1), "2021-05", "2021-05-31"))).toEqual(dates(empty))
    expect(dates(applicationCalendar(records, "2021-05", "2021-05-31"))).toEqual(dates(empty))
    expect(dates(applicationCalendar(records, "2021-05", "2021-05-31", "jobkorea"))).toEqual(dates(empty))
    expect(empty.cells[35]?.date).toBe("2021-05-31")
  })
  it("shows the selected source and month without substituting creation timestamps", () => {
    const records = [record({ appliedAt: "2026-10-19" }), record({ platform: "jobkorea", appliedAt: "2026-10-19" }), record({ appliedAt: "2026-09-01" }), record({ appliedAt: undefined, sourceCreatedAt: "2026-10-20" }), record({ appliedAt: "2026-10-21" }), record({ status: "pending_confirmation" }), record({ status: "cancelled" }), record({ status: "unknown" })]
    const filtered = applicationCalendar(records, "2026-10", "2026-10-20", "saramin")
    expect(filtered).toMatchObject({ total: 1, undated: 1 })
    expect(filtered.days.get("2026-10-19")).toHaveLength(1)
    expect(filtered.weekdays.map(day => day.count)).toEqual([1, 0, 0, 0, 0, 0, 0])
    expect(filtered.cells.find(cell => cell?.date === "2026-10-21")).toMatchObject({ future: true, records: [] })
    expect(applicationCalendar(records, "2026-10", "2026-10-20").total).toBe(2)
    expect(applicationCalendar(records, "2026-09", "2026-10-20").total).toBe(1)
  })
  it("preserves multiple roles on a date and sorts records predictably without mutating input", () => {
    const first = record({ id: "first", companyName: "테스트", jobTitle: "프론트엔드", appliedAt: "2026-10-20" })
    const second = record({ id: "second", companyName: "테스트", jobTitle: "백엔드", appliedAt: "2026-10-20" })
    const records = [first, second]
    const result = applicationCalendar(records, "2026-10", "2026-10-20")
    expect(result.days.get("2026-10-20")?.map(item => item.id)).toEqual(["second", "first"])
    expect(result.total).toBe(2)
    expect(records).toEqual([first, second])
  })
  it("filters manual site paths without mixing other manually added records", () => {
    const records = [record({ platform: "manual", sourceLabel: "리멤버", appliedAt: "2026-10-19" }), record({ platform: "manual", sourceLabel: "점핏", appliedAt: "2026-10-20" }), record({ platform: "manual", sourceLabel: "리멤버", appliedAt: undefined })]
    const result = applicationCalendar(records, "2026-10", "2026-10-20", "manual:리멤버")
    expect(result).toMatchObject({ total: 1, undated: 1 })
    expect([...result.days.keys()]).toEqual(["2026-10-19"])
    expect(result.weekdays.map(day => day.count)).toEqual([1, 0, 0, 0, 0, 0, 0])
  })
})
