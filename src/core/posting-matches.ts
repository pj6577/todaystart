import { CompanyMatcher } from "./company"
import type { ApplicationRecord, CompanyMatch, JobPosting } from "./model"

// One matcher per record/settings revision, reused across carousel mutations,
// repeated companies, and SPA pages. Bound result retention on long sessions.
export class PostingMatches {
  private records?: ApplicationRecord[]
  private includeCancelled = false
  private matcher?: CompanyMatcher
  private results = new Map<string, CompanyMatch[]>()

  update(records: ApplicationRecord[], includeCancelled: boolean) {
    if (this.records === records && this.includeCancelled === includeCancelled) return
    this.records = records; this.includeCancelled = includeCancelled
    this.matcher = new CompanyMatcher(records, includeCancelled)
    this.results.clear()
  }
  find(posting: JobPosting, similar: boolean) {
    const key = JSON.stringify([posting.platform, posting.companyName, posting.companyIdentifier, similar])
    let found = this.results.get(key)
    if (!found) {
      found = this.matcher!.find(posting, similar)
      if (this.results.size >= 256) this.results.clear()
      this.results.set(key, found)
    }
    return found
  }
}
