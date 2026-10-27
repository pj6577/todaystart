import type { ApplicationRecord, CollectionResult, JobPosting, Platform } from "../core/model"
import { jobIdFromUrl, platformForUrl, safeJobUrl } from "../core/urls"
import { parseHistory, parsePosting, parseRecord } from "./parser"
import type { SelectorProfile } from "./profile"
import { publicPostingProfileFor, type PostingPageProfile } from "./public-postings"
import { parseBuiltInHistory } from "./history"
import { platformDefinitions } from "../core/platforms"
import { isBuiltInHistoryUrl } from "./history-pagination"
import { jobkoreaDetailPosting } from "./jobkorea-detail"

export interface JobPlatformAdapter {
  platform: Platform
  isApplicationHistoryPage(url: string): boolean
  isJobListingPage(url: string): boolean
  isJobDetailPage(url: string): boolean
  extractApplications(document: Document): ApplicationRecord[]
  extractJobPostings(document: Document): JobPosting[]
  detectApplicationSuccess(document: Document): boolean
}

export class DomPlatformAdapter implements JobPlatformAdapter {
  constructor(readonly platform: Platform, readonly profile?: SelectorProfile) {}
  private path(url: string, paths: string[]): boolean {
    if (platformForUrl(url) !== this.platform) return false
    const path = new URL(url).pathname.toLowerCase()
    return paths.some(prefix => path === prefix.toLowerCase() || path.startsWith(prefix.toLowerCase().replace(/\/$/, "") + "/"))
  }
  isApplicationHistoryPage(url: string) {
    // The semantic fallback is limited to the exact built-in history routes.
    return isBuiltInHistoryUrl(url, this.platform) || this.path(url, this.profile?.historyPaths || [])
  }
  isJobListingPage(url: string) {
    if (platformForUrl(url) !== this.platform) return false
    const parsed = new URL(url), definition = platformDefinitions[this.platform]
    return !!definition.listingPages?.some(page => page.host === parsed.hostname && page.path.test(parsed.pathname)) || this.path(url, [...definition.listingPaths, ...(this.profile?.listingPaths || [])])
  }
  isJobDetailPage(url: string) { return this.path(url, [...platformDefinitions[this.platform].detailPaths, ...(this.profile?.detailPaths || [])]) }
  collect(doc: Document): CollectionResult {
    if (!this.profile) return parseBuiltInHistory(doc, this.platform)
    try { return parseHistory(doc, this.profile, doc.URL) }
    catch { return { records: [], code: "dom_changed", message: "선택자 설정 또는 페이지 구조를 확인해 주세요. 기존 기록은 유지됩니다.", skipped: 0, hasNextPage: false, scope: "미수집" } }
  }
  extractApplications(doc: Document) { return this.collect(doc).records }
  postingProfile(url: string, doc?: Document): PostingPageProfile | undefined {
    if (platformForUrl(url) !== this.platform) return undefined
    const builtIn = publicPostingProfileFor(this.platform, url)
    if (this.profile && this.path(url, [...this.profile.listingPaths, ...this.profile.detailPaths])) {
      const custom = { root: this.profile.listingRoot, posting: this.profile.posting, fields: this.profile.postingFields }
      if (!doc) return custom
      const root = doc.querySelector(custom.root)
      const elements = !root ? [] : custom.posting === ":scope" ? [root] : [...root.querySelectorAll(custom.posting)]
      // Preserve working overrides. An old history/list profile must not hide
      // a supported public layout when its selectors no longer read any jobs.
      if (elements.some(element => parsePosting(element, custom.fields, this.platform, url))) return custom
      return builtIn || custom
    }
    return builtIn
  }
  extractJobPostings(doc: Document): JobPosting[] {
    const profile = this.postingProfile(doc.URL, doc)
    if (!profile) return []
    const fallback = () => profile === publicPostingProfileFor(this.platform, doc.URL) && this.platform === "jobkorea" && this.isJobDetailPage(doc.URL) ? jobkoreaDetailPosting(doc) : undefined
    const root = doc.querySelector(profile.root)
    if (!root) { const posting = fallback(); return posting ? [posting] : [] }
    const elements = profile.posting === ":scope" ? [root] : Array.from(root.querySelectorAll(profile.posting))
    const postings = elements.map(element => {
      const posting = parsePosting(element, profile.fields, this.platform, doc.URL)
      if (!posting) return undefined
      if (profile.requireJobId && !posting.sourceJobId) return undefined
      if (profile.usePageUrl) {
        posting.jobUrl = safeJobUrl(doc.URL, this.platform)
        posting.sourceJobId = jobIdFromUrl(posting.jobUrl)
      }
      if (profile.warningTarget) posting.element = element.querySelector(profile.warningTarget) || element
      return posting
    }).filter((posting): posting is JobPosting => !!posting)
    if (!postings.length) { const posting = fallback(); if (posting) postings.push(posting) }
    return postings
  }
  detectApplicationSuccess(doc: Document): boolean {
    const marker = this.profile?.success
    return !!marker && doc.querySelector(marker.selector)?.textContent?.trim() === marker.text
  }
  successRecord(doc: Document): ApplicationRecord | undefined {
    if (!this.profile?.success || !this.detectApplicationSuccess(doc)) return undefined
    const row = doc.querySelector(this.profile.success.record)
    return row ? parseRecord(row, this.profile, doc.URL, "success_page", "applied") : undefined
  }
}
