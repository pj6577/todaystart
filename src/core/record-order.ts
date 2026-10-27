import { DateSchema, readStatusLabel, recordReadStatus, recordStatusLabel, sourceLabel, type ApplicationRecord } from "./model"

export type RecordSortKey = "companyName" | "jobTitle" | "source" | "appliedAt" | "status" | "readStatus"
export type RecordSort = { key: RecordSortKey; direction: "ascending" | "descending" }
const collator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" })

export function compareRecordsByColumn(a: ApplicationRecord, b: ApplicationRecord, sort: RecordSort) {
  if (sort.key === "appliedAt") return compareApplicationRecords(a, b, sort.direction === "descending" ? "newest" : "oldest")
  const value = (record: ApplicationRecord) => sort.key === "source" ? sourceLabel(record) : sort.key === "status" ? recordStatusLabel(record) : sort.key === "readStatus" ? readStatusLabel[recordReadStatus(record)] : record[sort.key]
  const comparison = collator.compare(value(a) || "", value(b) || "")
  return (sort.direction === "ascending" ? comparison : -comparison) || compareApplicationRecords(a, b)
}

const timestamp = (value?: string) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0
// Resume creation is not submission. Only a known application date determines
// the day; records without that date stay after dated applications.
export function compareApplicationRecords(a: ApplicationRecord, b: ApplicationRecord, order = "newest") {
  const added = timestamp(b.collectedAt) - timestamp(a.collectedAt)
  if (order === "added") return added || a.id.localeCompare(b.id)
  const dayA = DateSchema.safeParse(a.appliedAt).success ? a.appliedAt! : ""
  const dayB = DateSchema.safeParse(b.appliedAt).success ? b.appliedAt! : ""
  if (!dayA || !dayB) return dayA ? -1 : dayB ? 1 : added || a.id.localeCompare(b.id)
  const dayOrder = dayB.localeCompare(dayA)
  const time = (record: ApplicationRecord) => {
    const value = timestamp(record.appliedAtTime)
    const sameDay = value && new Date(value + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) === record.appliedAt
    return sameDay ? value : timestamp(record.collectedAt)
  }
  const comparison = dayOrder || time(b) - time(a) || a.id.localeCompare(b.id)
  return order === "oldest" ? -comparison : comparison
}
