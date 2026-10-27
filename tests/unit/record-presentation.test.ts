import { expect, it } from "vitest"
import { recordDateLabel, recordReadStatus } from "../../src/core/model"
import { applicationReadingStats } from "../../src/ui/dashboard-stats"
import { compareRecordsByColumn } from "../../src/core/record-order"
import { record } from "../helpers"

it.each(["불합격", "서류 전형 불합격", "최종 전형 불합격", "불합격 (서류)", "reject", "REJECTED"])("treats confirmed rejection %s as read, not unknown", sourceStatus => {
  const application = record({ platform: "wanted", sourceStatus, readStatus: "unknown" })
  expect(applicationReadingStats([application])).toEqual({ total: 1, read: 1, unread: 0, rejected: 1, unknown: 0 })
  expect(application.readStatus).toBe("unknown")
  expect(recordReadStatus(application)).toBe("read")
})

it.each(["불합격 여부 미확인", "불합격 아님", "not rejected", "reject pending", "지원 접수"])("does not infer rejection from %s", sourceStatus => {
  expect(applicationReadingStats([record({ sourceStatus, readStatus: "unknown" })])).toEqual({ total: 1, read: 0, unread: 0, rejected: 0, unknown: 1 })
})

it("formats application and source creation dates consistently without inventing an application date", () => {
  const wanted = record({ platform: "wanted", appliedAt: undefined, sourceCreatedAt: "2026-03-19T10:00:00+09:00" })
  expect(recordDateLabel(wanted)).toBe("2026.03.19")
  expect(recordDateLabel(record({ appliedAt: "2026-03-19" }))).toBe("2026.03.19")
  expect(wanted.appliedAt).toBeUndefined()
  expect(wanted.sourceCreatedAt).toBe("2026-03-19T10:00:00+09:00")
  expect(recordDateLabel(record({ appliedAt: undefined }))).toBe("날짜 미확인")
})

it("sorts a rejected record with unknown source reading as the same displayed read status as other read records", () => {
  const rejected = record({ id: "rejected", platform: "wanted", sourceStatus: "불합격", readStatus: "unknown", appliedAt: "2026-10-20" })
  const read = record({ id: "read", readStatus: "read", appliedAt: "2026-10-22" })
  for (const direction of ["ascending", "descending"] as const) {
    expect([rejected, read].sort((a, b) => compareRecordsByColumn(a, b, { key: "readStatus", direction })).map(item => item.id)).toEqual(["read", "rejected"])
  }
})

it("keeps a received application unknown while treating a confirmed rejection as read", () => {
  const remember = record({ platform: "remember", companyName: "메디맵(주)", sourceStatus: "지원 접수", readStatus: "unknown" })
  const wanted = record({ platform: "wanted", companyName: "넥스트그라운드", sourceStatus: "불합격", readStatus: "unknown" })
  expect(recordReadStatus(remember)).toBe("unknown")
  expect(recordReadStatus(wanted)).toBe("read")
  expect(applicationReadingStats([remember, wanted])).toEqual({ total: 2, read: 1, unread: 0, rejected: 1, unknown: 1 })
})
