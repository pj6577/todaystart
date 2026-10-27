import { expect, it } from "vitest"
import { compareApplicationRecords, compareRecordsByColumn } from "../../src/core/record-order"
import { record } from "../helpers"

it("orders same-day applications by submission time rather than ID, company or resync time", () => {
  const a = record({ id: "z", companyName: "A", appliedAt: "2026-10-21", appliedAtTime: "2026-10-21T01:00:00Z", lastSeenAt: "2026-10-22T00:00:00Z" })
  const b = record({ id: "a", companyName: "B", appliedAt: "2026-10-21", appliedAtTime: "2026-10-21T02:00:00Z" })
  const c = record({ id: "m", companyName: "C", appliedAt: "2026-10-21", appliedAtTime: "2026-10-21T03:00:00Z" })
  expect([b,a,c].sort(compareApplicationRecords).map(r => r.companyName)).toEqual(["C","B","A"])
  expect([b,a,c].sort((a,b) => compareApplicationRecords(a,b,"oldest")).map(r => r.companyName)).toEqual(["A","B","C"])
})
it("does not treat resume creation or latest sync as a submission date", () => {
  const dated = record({ id: "dated", appliedAt: "2026-10-21", collectedAt: "2026-10-21T00:00:00Z" })
  const undated = record({ id: "undated", appliedAt: undefined, sourceCreatedAt: "2027-01-01T01:00:00+09:00", collectedAt: "2026-10-22T00:00:00Z" })
  expect([undated,dated].sort(compareApplicationRecords)[0]).toBe(dated)
  expect([undated,dated].sort((a,b) => compareApplicationRecords(a,b,"oldest"))[0]).toBe(dated)
  expect([dated,undated].sort((a,b) => compareApplicationRecords(a,b,"added"))[0]).toBe(undated)
})
it("uses stable first-added order when a submission time was never recorded", () => {
  const a = record({ id: "a", collectedAt: "2026-10-21T00:00:00Z" })
  const b = record({ id: "b", collectedAt: "2026-10-21T01:00:00Z", lastSyncedAt: "2026-10-21T02:00:00Z" })
  expect([a,b].sort(compareApplicationRecords)[0]).toBe(b)
  expect([b,a].sort(compareApplicationRecords)[0]).toBe(b)
})

it("sorts source columns using the displayed manual path and natural numeric order", () => {
  const records = [record({ companyName: "기업 10", platform: "manual", sourceLabel: "경로 10" }), record({ companyName: "기업 2", platform: "manual", sourceLabel: "경로 2" })]
  expect([...records].sort((a,b) => compareRecordsByColumn(a,b,{ key: "source", direction: "ascending" })).map(r => r.sourceLabel)).toEqual(["경로 2", "경로 10"])
  expect([...records].sort((a,b) => compareRecordsByColumn(a,b,{ key: "companyName", direction: "descending" })).map(r => r.companyName)).toEqual(["기업 10", "기업 2"])
})

it("keeps tied column values in latest submission order in either direction", () => {
  const a = record({ id: "a", jobTitle: "개발자", sourceStatus: "서류 통과", appliedAt: "2026-10-20" })
  const b = record({ id: "b", jobTitle: "개발자", sourceStatus: "불합격", appliedAt: "2026-10-21" })
  for (const direction of ["ascending", "descending"] as const) expect([a,b].sort((a,b) => compareRecordsByColumn(a,b,{ key: "jobTitle", direction })).map(r => r.id)).toEqual(["b","a"])
  expect([a,b].sort((a,b) => compareRecordsByColumn(a,b,{ key: "status", direction: "ascending" }))[0]).toBe(b)
})
