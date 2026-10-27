import { normalizeCompanyName } from "./company"
import type { ApplicationRecord } from "./model"

type Identity = Pick<ApplicationRecord, "platform" | "sourceApplicationId" | "sourceJobId" | "companyName" | "jobTitle" | "appliedAt" | "jobUrl"> & Partial<Pick<ApplicationRecord, "status" | "sourceLabel" | "sourceCreatedAt" | "submissionAttemptId">>
export function applicationIdentity(record: Identity): string {
  if (record.sourceApplicationId) return JSON.stringify([record.platform, "application", record.sourceApplicationId])
  if (record.submissionAttemptId && record.status === "pending_confirmation") return JSON.stringify([record.platform, "attempt", record.submissionAttemptId])
  if (record.platform === "wanted" && record.sourceCreatedAt && !record.appliedAt) return JSON.stringify(["wanted", "created", normalizeCompanyName(record.companyName), record.jobTitle.normalize("NFKC").trim(), record.sourceCreatedAt.slice(0, 10)])
  if (record.platform !== "manual" && record.status === "pending_confirmation" && (record.sourceJobId || record.jobUrl)) return JSON.stringify([record.platform, "pending", record.sourceJobId || record.jobUrl, record.jobTitle])
  // Without a date, same posting alone cannot prove that two applications are the same event.
  if (!record.appliedAt) return JSON.stringify([record.platform, "unresolved", crypto.randomUUID()])
  const parts = [record.platform, "composite", record.sourceJobId || record.jobUrl || null,
    normalizeCompanyName(record.companyName), record.jobTitle.normalize("NFKC").trim(), record.appliedAt]
  if (record.platform === "manual") parts.push(record.sourceLabel || "직접 지원")
  return JSON.stringify(parts)
}

export function mergedRecord(previous: ApplicationRecord, incoming: ApplicationRecord): ApplicationRecord {
  const incomingIsNewer = incoming.lastSeenAt >= previous.lastSeenAt
  const next = incomingIsNewer ? incoming : previous
  const other = incomingIsNewer ? previous : incoming
  // Unknown/pending observations do not erase confirmed application/cancellation evidence.
  const status = (next.status === "unknown" || next.status === "pending_confirmation") &&
    (other.status === "applied" || other.status === "cancelled") ? other.status : next.status
  const evidence = status === other.status && status !== next.status ? other.evidence : next.evidence
  const defined = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined))
  const readStatus = next.readStatus && next.readStatus !== "unknown" ? next.readStatus : other.readStatus || next.readStatus
  const sourceCreatedAt = next.sourceCreatedAt?.length === 10 && other.sourceCreatedAt?.startsWith(next.sourceCreatedAt) ? other.sourceCreatedAt : next.sourceCreatedAt || other.sourceCreatedAt
  return { ...other, ...defined, id: previous.id, collectedAt: previous.collectedAt, status, evidence, ...(readStatus ? { readStatus } : {}), ...(sourceCreatedAt ? { sourceCreatedAt } : {}) } as ApplicationRecord
}
