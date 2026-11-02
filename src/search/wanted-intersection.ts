import type { SearchJob, SearchPage } from "./model"

// Owned by one submitted search in the UI. Never persisted or shared across tabs.
// Both inputs are filtered by Wanted. Membership is matched only by posting ID,
// without guessing from job titles, company names or rendered experience labels.
export class WantedIntersection {
  private key = ""
  private keyword = new Map<string, SearchJob>()
  private category = new Map<string, SearchJob>()
  private emitted = new Set<string>()
  private pages = new Map<number, SearchPage>()
  keywordDone = false
  categoryDone = false

  prepare(key: string) {
    if (key === this.key) return
    this.key = key; this.keyword.clear(); this.category.clear(); this.emitted.clear(); this.pages.clear()
    this.keywordDone = false; this.categoryDone = false
  }
  cached(page: number) { return this.pages.get(page) }
  merge(page: number, keyword: SearchPage, category: SearchPage): SearchPage {
    // Commit only after both requests succeeded, so retrying a failed/cancelled
    // batch cannot skip unseen jobs or consume matches before they are displayed.
    for (const part of [keyword, category]) if (part.status !== "ok" && part.status !== "empty") return part
    const repeated = (known: Map<string, SearchJob>, next: SearchJob[]) => next.length > 0 && next.every(job => known.has(job.id))
    this.keywordDone ||= !keyword.hasNext || repeated(this.keyword, keyword.jobs)
    this.categoryDone ||= !category.hasNext || repeated(this.category, category.jobs)
    keyword.jobs.forEach(job => this.keyword.set(job.id, job))
    category.jobs.forEach(job => this.category.set(job.id, job))
    const jobs: SearchJob[] = []
    for (const [id, job] of this.keyword) {
      const categoryJob = this.category.get(id)
      if (!categoryJob || this.emitted.has(id)) continue
      jobs.push({ ...job, ...(categoryJob.location ? { location: categoryJob.location } : {}) }); this.emitted.add(id)
    }
    const covered = (known: Map<string, SearchJob>) => [...known.keys()].every(id => this.emitted.has(id))
    const hasNext = !(this.keywordDone && this.categoryDone || this.keywordDone && covered(this.keyword) || this.categoryDone && covered(this.category))
    const result: SearchPage = { jobs, hasNext, status: jobs.length || hasNext ? "ok" : "empty", matching: hasNext && !jobs.length }
    this.pages.set(page, result)
    return result
  }
}
