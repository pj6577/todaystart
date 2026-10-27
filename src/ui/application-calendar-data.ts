import { DateSchema, type ApplicationRecord } from "../core/model"
import { applicationPath, type ApplicationPath } from "../core/application-path"

export function shiftCalendarMonth(month: string, offset: number) {
  const [year, index] = month.split("-").map(Number)
  return new Date(Date.UTC(year!, index! - 1 + offset, 1)).toISOString().slice(0, 7)
}

// This projection can also be used by a separate calendar page. It never mutates
// application records and keeps resume/collection timestamps out of the calendar.
export function applicationCalendar(records: ApplicationRecord[], month: string, today: string, source: ApplicationPath | "all" = "all") {
  const days = new Map<string, ApplicationRecord[]>()
  const weekdays = ["월", "화", "수", "목", "금", "토", "일"].map(label => ({ key: `${label}요일`, label, count: 0 }))
  let total = 0, undated = 0
  for (const record of records) {
    if (record.status !== "applied" || (source !== "all" && applicationPath(record) !== source)) continue
    if (!DateSchema.safeParse(record.appliedAt).success) { undated++; continue }
    const day = record.appliedAt!
    if (!day.startsWith(month + "-") || day > today) continue
    const entries = days.get(day) || []
    entries.push(record)
    days.set(day, entries)
    weekdays[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7]!.count++
    total++
  }
  for (const entries of days.values()) entries.sort((a, b) => a.companyName.localeCompare(b.companyName, "ko") || a.jobTitle.localeCompare(b.jobTitle, "ko") || a.id.localeCompare(b.id))
  const first = new Date(`${month}-01T00:00:00Z`)
  const offset = (first.getUTCDay() + 6) % 7
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  // Reserve six complete weeks so month changes and empty weeks never resize the calendar.
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1
    if (day < 1 || day > length) return null
    const date = `${month}-${String(day).padStart(2, "0")}`
    return { date, day, records: days.get(date) || [], future: date > today }
  })
  return { cells, days, weekdays, total, undated }
}
