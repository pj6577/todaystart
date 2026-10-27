import { DateSchema, isRejectedApplication, recordReadStatus, type ApplicationRecord } from "../core/model"
import { applicationPath, type ApplicationPath } from "../core/application-path"

export type TrendPeriod = "months" | "days"
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
export const sharePercent = (count: number, total: number) => total ? Math.round(count / total * 1000) / 10 : 0

export function applicationReadingStats(records: ApplicationRecord[]) {
  const counts = { total: 0, read: 0, unread: 0, rejected: 0, unknown: 0 }
  for (const record of records) {
    if (record.status !== "applied") continue
    counts.total++
    const rejected = isRejectedApplication(record)
    if (rejected) counts.rejected++
    const reading = recordReadStatus(record)
    if (reading === "read") counts.read++
    else if (reading === "unread") counts.unread++
    else counts.unknown++
  }
  return counts
}

export function dashboardStats(records: ApplicationRecord[], today: string, period: TrendPeriod, source: ApplicationPath | "all" = "all") {
  const applied = records.filter(record => record.status === "applied" && (source === "all" || applicationPath(record) === source))
  const sources = new Map<ApplicationPath, number>()
  for (const record of applied) { const path = applicationPath(record); sources.set(path, (sources.get(path) || 0) + 1) }
  const dated = applied.filter(record => DateSchema.safeParse(record.appliedAt).success)
  const end = new Date(`${today}T00:00:00Z`)
  const bins = Array.from({ length: period === "months" ? 6 : 30 }, (_, index) => {
    const date = period === "months"
      ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5 + index, 1))
      : new Date(end.getTime() - (29 - index) * 86400000)
    const key = date.toISOString().slice(0, period === "months" ? 7 : 10)
    return { key, label: period === "months" ? `${date.getUTCMonth() + 1}월` : `${date.getUTCMonth() + 1}.${date.getUTCDate()}`, count: 0 }
  })
  const weekdays = ["월", "화", "수", "목", "금", "토", "일"].map(label => ({ label, count: 0 }))
  const byKey = new Map(bins.map(bin => [bin.key, bin]))
  for (const record of dated) {
    const day = record.appliedAt!
    const bin = byKey.get(day.slice(0, period === "months" ? 7 : 10))
    if (bin && day <= today) {
      bin.count++
      weekdays[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7]!.count++
    }
  }
  return {
    total: applied.length, dated: dated.length, undated: applied.length - dated.length,
    sources: [...sources].map(([platform, count]) => ({ platform, count })),
    bins, weekdays, periodTotal: bins.reduce((total, bin) => total + bin.count, 0),
    start: `${bins[0]!.key}${period === "months" ? "-01" : ""}`, end: today
  }
}
