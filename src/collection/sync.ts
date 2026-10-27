import type { CollectionResult, Platform, SyncReport } from "../core/model"
import { ApplicationRepository } from "../storage/repository"

export async function syncCollection(repository: ApplicationRepository, platform: Platform, result: CollectionResult): Promise<SyncReport> {
  const valid = ["ok", "partial"].includes(result.code)
  const counts = valid ? await repository.merge(result.records) : { inserted: 0, updated: 0 }
  const { records, ...diagnostics } = result
  return { ...diagnostics, ...counts, platform, collected: valid ? records.length : 0, at: new Date().toISOString() }
}
