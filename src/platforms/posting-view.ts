import type { ApplicationRecord, JobPosting } from "../core/model"

// Attribute-only animation changes still need parsing (selectors can depend on
// classes), but unchanged cards do not need matching warnings rendered again.
export class PostingView {
  private postings: JobPosting[] = []
  private records?: ApplicationRecord[]
  private presentation = ""
  changed(postings: JobPosting[], records: ApplicationRecord[], presentation: string) {
    const changed = this.records !== records || this.presentation !== presentation || this.postings.length !== postings.length || postings.some((posting, index) => {
      const previous = this.postings[index]!
      return posting.element !== previous.element || posting.companyName !== previous.companyName || posting.companyIdentifier !== previous.companyIdentifier || posting.jobTitle !== previous.jobTitle || posting.jobUrl !== previous.jobUrl || posting.sourceJobId !== previous.sourceJobId || posting.platform !== previous.platform
    })
    this.postings = postings; this.records = records; this.presentation = presentation
    return changed
  }
  clear() { this.postings = []; this.records = undefined; this.presentation = "" }
}
