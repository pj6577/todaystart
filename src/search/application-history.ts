import { companyMatchNameKey } from "../core/company"
import { compareApplicationRecords } from "../core/record-order"
import type { ApplicationRecord } from "../core/model"

// Share the display-only comparison with native-site posting warnings.
export const searchCompanyNameKey = companyMatchNameKey

// Build once per record snapshot; search cards never send local history to a site.
export function applicationHistoryIndex(records: ApplicationRecord[]) {
  const index = new Map<string, ApplicationRecord[]>()
  for (const record of records) {
    if (record.status !== "applied") continue
    const name = searchCompanyNameKey(record.companyName)
    if (!name) continue
    const bucket = index.get(name)
    if (bucket) bucket.push(record)
    else index.set(name, [record])
  }
  for (const bucket of index.values()) bucket.sort(compareApplicationRecords)
  return index
}
