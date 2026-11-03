import { z } from "zod"
import { compareCompanies } from "./company"
import type { ApplicationRecord } from "./model"
import { safeJobUrl } from "./urls"

export const JobkoreaAppliedStatusSchema = z.object({
  sourceJobId: z.string().regex(/^\d{1,20}$/), companyName: z.string().trim().min(1).max(300),
  jobTitle: z.string().trim().min(1).max(1000), jobUrl: z.string().url().max(3000)
}).strict()
export type JobkoreaAppliedStatus = z.infer<typeof JobkoreaAppliedStatusSchema>
export function jobkoreaDetailId(raw: string): string | undefined {
  const clean = safeJobUrl(raw, "jobkorea")
  return clean ? new URL(clean).pathname.match(/^\/recruit\/gi_read\/(\d{1,20})\/?$/i)?.[1] : undefined
}
export function hasJobkoreaAppliedCompany(posting: JobkoreaAppliedStatus, records: ApplicationRecord[]): boolean {
  return records.some(record => record.platform === "jobkorea" && record.sourceJobId === posting.sourceJobId ||
    compareCompanies({ companyName: posting.companyName }, { companyName: record.companyName }) !== "none")
}
