import type { ApplicationRecord } from "../core/model"
import { jobIdFromUrl, safeJobUrl } from "../core/urls"
import type { SubmissionAttempt } from "./model"

const day = (iso: string) => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10)
const key = (platform: string, jobId: string, date: string) => JSON.stringify([platform, jobId, date])

// History is independent completion evidence. Match a single observed submission
// to a single imported application; company names and titles are not identifiers.
export function importedSubmissionMatches(attempts: SubmissionAttempt[], records: ApplicationRecord[]) {
  const index = new Map<string, ApplicationRecord[]>()
  for (const record of records) {
    if (record.status !== "applied" || record.evidence !== "history_page" || !record.appliedAt) continue
    const urlId = jobIdFromUrl(safeJobUrl(record.jobUrl, record.platform))
    if (record.sourceJobId && urlId && record.sourceJobId !== urlId) continue
    const jobId = record.sourceJobId || urlId
    if (!jobId) continue
    const id = key(record.platform, jobId, record.appliedAt)
    const group = index.get(id) || []
    group.push(record); index.set(id, group)
  }
  const candidates = new Map<string, ApplicationRecord[]>(), owners = new Map<string, number>()
  for (const attempt of attempts) {
    if (!attempt.requestId && !attempt.clickedAt) continue
    // Jobkorea's OnPass ID is not the public posting ID. Require its verified context.
    const jobId = attempt.context?.sourceJobId || (attempt.platform !== "jobkorea" ? attempt.sourceJobId : undefined)
    if (!jobId) continue
    const started = Date.parse(attempt.startedAt)
    const matches = (index.get(key(attempt.platform, jobId, day(attempt.clickedAt || attempt.startedAt))) || []).filter(record =>
      (!record.submissionAttemptId || record.submissionAttemptId === attempt.id) &&
      Date.parse(record.collectedAt) >= started &&
      (!record.appliedAtTime || Date.parse(record.appliedAtTime) >= started)
    )
    candidates.set(attempt.id, matches)
    for (const record of matches) owners.set(record.id, (owners.get(record.id) || 0) + 1)
  }
  const matches = new Map<string, ApplicationRecord>()
  for (const attempt of attempts) {
    if (attempt.stage === "confirmed") continue
    const group = candidates.get(attempt.id)
    if (group?.length === 1 && owners.get(group[0]!.id) === 1) matches.set(attempt.id, group[0]!)
  }
  return matches
}
