import type { ApplicationRecord } from "../core/model"
import { jobIdFromUrl, safeJobUrl } from "../core/urls"
import type { SubmissionAttempt } from "../submission/model"

export interface SubmissionActivityGroup {
  key: string
  attempts: SubmissionAttempt[]
  attempt: SubmissionAttempt
  record?: ApplicationRecord
  updatedAt: string
}

const day = (attempt: SubmissionAttempt) => new Date(Date.parse(attempt.clickedAt || attempt.startedAt) + 9 * 3600000).toISOString().slice(0, 10)
const priority = { confirmed: 3, unverified: 2, submitting: 1, started: 0 }

// This is a projection of notices, not evidence that an individual attempt succeeded.
// Keep public posting IDs and Jobkorea's internal form IDs in separate namespaces.
export function submissionActivityGroups(attempts: SubmissionAttempt[], records: ApplicationRecord[], dismissed: string[] = []): SubmissionActivityGroup[] {
  const aliases = new Map<string, Set<string>>()
  const byId = new Map(attempts.map(attempt => [attempt.id, attempt]))
  const aliasKey = (internal: string, date: string) => JSON.stringify([internal, date])
  function alias(internal: string | undefined, posting: string | undefined, date: string | undefined) {
    if (!internal || !posting || !date) return
    const key = aliasKey(internal, date), ids = aliases.get(key) || new Set<string>()
    ids.add(posting); aliases.set(key, ids)
  }
  for (const attempt of attempts) if (attempt.platform === "jobkorea" && attempt.context) {
    alias(attempt.context.internalGiNo || (attempt.sourceJobId !== attempt.context.sourceJobId ? attempt.sourceJobId : undefined), attempt.context.sourceJobId, day(attempt))
  }
  for (const record of records) if (record.platform === "jobkorea") {
    const urlId = jobIdFromUrl(safeJobUrl(record.jobUrl, record.platform))
    const owner = record.submissionAttemptId ? byId.get(record.submissionAttemptId) : undefined
    if (!record.sourceJobId || !urlId || record.sourceJobId === urlId) alias(record.internalGiNo, record.sourceJobId || urlId, owner?.platform === record.platform ? day(owner) : record.appliedAt)
  }
  const groups = new Map<string, SubmissionAttempt[]>()
  for (const attempt of attempts) {
    // Old builds marked even opened-and-closed windows as unverified. A stage
    // alone is not submission evidence. Jobkorea's final-button click can also
    // stop at validation/confirmation; review it only after an observed request.
    // Wanted has a separate click + completion-route flow and no request hook.
    if (attempt.stage !== "confirmed" && !attempt.requestId && !(attempt.platform === "wanted" && attempt.clickedAt)) continue
    const known = aliases.get(aliasKey(attempt.sourceJobId, day(attempt)))
    const publicId = attempt.context?.sourceJobId || (attempt.platform !== "jobkorea" ? attempt.sourceJobId : known?.size === 1 ? [...known][0] : undefined)
    const key = JSON.stringify([attempt.platform, publicId ? "posting" : "form", publicId || attempt.sourceJobId, day(attempt)])
    const members = groups.get(key) || []
    members.push(attempt); groups.set(key, members)
  }
  const hidden = new Set(dismissed), result: SubmissionActivityGroup[] = []
  for (const [key, members] of groups) {
    const ids = new Set(members.map(attempt => attempt.id))
    const linked = records.filter(record => record.platform === members[0]!.platform && record.submissionAttemptId && ids.has(record.submissionAttemptId))
    // Once the posting/day has a recorded outcome, its other notices are redundant.
    // Preserve all underlying attempts and records, including independent retries.
    if (linked.some(record => record.status === "applied" || record.status === "cancelled") || members.some(attempt => attempt.stage === "confirmed" && attempt.context)) continue
    const visible = members.filter(attempt => !hidden.has(attempt.id))
    const actionable = visible.filter(attempt => attempt.stage !== "started")
      .sort((a, b) => priority[b.stage] - priority[a.stage] || Number(!!b.context) - Number(!!a.context) || b.updatedAt.localeCompare(a.updatedAt))
    if (!actionable.length) continue
    const actionableIds = new Set(actionable.map(attempt => attempt.id))
    const record = linked.filter(record => actionableIds.has(record.submissionAttemptId!))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0]
    const attempt = actionable.find(attempt => attempt.id === record?.submissionAttemptId) || actionable[0]!
    result.push({ key, attempts: visible, attempt, record, updatedAt: visible.reduce((latest, attempt) => attempt.updatedAt > latest ? attempt.updatedAt : latest, attempt.updatedAt) })
  }
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
