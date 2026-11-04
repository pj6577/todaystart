import { DateSchema, type ApplicationRecord } from "../core/model"
import { normalizeCompanyName } from "../core/company"
import { jobIdFromUrl } from "../core/urls"

const title = (record: ApplicationRecord) => record.jobTitle.normalize("NFKC").replace(/\s+/g, " ").trim()

// Unlike applicationIdentity, this continues to identify a history row after
// an observed completion supplies its actual appliedAt and posting ID.
export function wantedHistoryKey(record: ApplicationRecord): string | undefined {
  const date = record.sourceCreatedAt?.slice(0, 10)
  if (record.platform !== "wanted" || !date || !DateSchema.safeParse(date).success) return undefined
  return JSON.stringify([normalizeCompanyName(record.companyName), title(record), date])
}

export function wantedIdentifiersAgree(a: ApplicationRecord, b: ApplicationRecord): boolean {
  const aUrlId = jobIdFromUrl(a.jobUrl), bUrlId = jobIdFromUrl(b.jobUrl)
  if (a.sourceJobId && aUrlId && a.sourceJobId !== aUrlId || b.sourceJobId && bUrlId && b.sourceJobId !== bUrlId) return false
  const aJobId = a.sourceJobId || aUrlId, bJobId = b.sourceJobId || bUrlId
  return (!aJobId || !bJobId || aJobId === bJobId) && (["sourceApplicationId", "companyIdentifier", "submissionAttemptId"] as const)
    .every(field => !a[field] || !b[field] || a[field] === b[field])
}

export function wantedSubmissionHistoryPairs(records: ApplicationRecord[]) {
  const submissions = records.filter(record => record.platform === "wanted" && !record.sourceCreatedAt && record.status === "applied" &&
    record.appliedAt && record.submissionAttemptId && record.submissionStage === "confirmed")
  const histories = new Map<string, ApplicationRecord[]>()
  for (const record of records) {
    const key = wantedHistoryKey(record)
    if (key) histories.set(key, [...(histories.get(key) || []), record])
  }
  const candidates: { history: ApplicationRecord; submissions: ApplicationRecord[] }[] = []
  const owners = new Map<string, number>()
  for (const group of histories.values()) {
    const matches = submissions.filter(submission => group.some(history => {
      if (!wantedIdentifiersAgree(history, submission) || normalizeCompanyName(history.companyName) !== normalizeCompanyName(submission.companyName) || title(history) !== title(submission)) return false
      if (history.appliedAt && history.appliedAt !== submission.appliedAt) return false
      const created = history.sourceCreatedAt!.slice(0, 10)
      // Creation is not an application date. A matching posting ID can connect
      // an older draft; DOM-only rows require same-day corroboration as well.
      return created <= submission.appliedAt! && (created === submission.appliedAt || !!(history.sourceJobId && submission.sourceJobId === history.sourceJobId))
    }))
    // Ambiguous visible rows must still block another row claiming the same
    // completion; simply skipping them could merge an unrelated older draft.
    if (group.length === 1) candidates.push({ history: group[0]!, submissions: matches })
    for (const match of matches) owners.set(match.id, (owners.get(match.id) || 0) + 1)
  }
  return candidates.flatMap(candidate => candidate.submissions.length === 1 && owners.get(candidate.submissions[0]!.id) === 1
    ? [{ history: candidate.history, submission: candidate.submissions[0]! }] : [])
}
