import type { JobPosting } from "../core/model"
import { jobIdFromUrl, safeJobUrl } from "../core/urls"
import { JobkoreaAppliedStatusSchema, jobkoreaDetailId, type JobkoreaAppliedStatus } from "../core/jobkorea-applied-status"

function shown(doc: Document, element: Element): boolean {
  if (!doc.defaultView || !element.getClientRects().length || element.closest('[hidden],[inert],[aria-hidden="true"]')) return false
  for (let parent: Element | null = element; parent; parent = parent.parentElement) {
    const style = doc.defaultView.getComputedStyle(parent)
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return false
  }
  return true
}

function atfPostings(doc: Document, visible = false): JobPosting[] {
  const sourceJobId = jobkoreaDetailId(doc.URL), jobUrl = safeJobUrl(doc.URL, "jobkorea")
  if (!sourceJobId || !jobUrl) return []
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute("href")
  if (canonical && jobkoreaDetailId(safeJobUrl(canonical, "jobkorea", doc.URL) || "") !== sourceJobId) return []
  return [...doc.querySelectorAll('main [data-jobview-section="atf"]')].flatMap(root => {
    const company = root.querySelector<HTMLHeadingElement>('[data-sentry-component="CompanyName"] a[href] h2')
    const heading = root.querySelector<HTMLHeadingElement>('[data-sentry-component="TitleContent"] h1')
    const companyUrl = safeJobUrl(company?.closest("a")?.getAttribute("href"), "jobkorea", doc.URL)
    if (!company || !heading || !companyUrl || !/^\/recruit\/co_read\/c\/\d+\/?$/i.test(new URL(companyUrl).pathname)) return []
    if (visible && (!shown(doc, company) || !shown(doc, heading))) return []
    const companyName = company.textContent?.trim(), jobTitle = heading.textContent?.trim()
    if (!companyName || !jobTitle) return []
    return [{ platform: "jobkorea" as const, companyName, jobTitle, sourceJobId, jobUrl, element: heading.parentElement || heading }]
  })
}

// Inspected user DOM: an existing native ApplyButton status, not a new submit.
export function jobkoreaAppliedDetail(doc: Document): JobkoreaAppliedStatus | undefined {
  const postings = atfPostings(doc, true)
  if (!postings.length || new Set(postings.map(posting => JSON.stringify([posting.companyName, posting.jobTitle]))).size !== 1) return
  const buttons = [...doc.querySelectorAll('main button[data-sentry-component="ApplyButton"]')].filter(button =>
    !button.closest('[data-sentry-component="CardJob"],[data-jobview-section*="recommend" i],[data-sentry-component*="Recommend"]') && shown(doc, button))
  if (!buttons.length || buttons.some(button => button.textContent?.replace(/\s+/g, "") !== "지원완료")) return
  const { element: _, platform: __, ...posting } = postings[0]!
  const result = JobkoreaAppliedStatusSchema.safeParse(posting)
  return result.success ? result.data : undefined
}

// Observed current Jobkorea detail on 2026-10-20: the sticky Title contains
// only the job h1. The document title names the company separately. Never use
// recommendation cards or guess a company from the position's bracket prefix.
export function jobkoreaDetailPosting(doc: Document): JobPosting | undefined {
  const inspected = atfPostings(doc)
  if (inspected.length && new Set(inspected.map(posting => JSON.stringify([posting.companyName, posting.jobTitle]))).size === 1) return inspected[0]
  const jobUrl = safeJobUrl(doc.URL, "jobkorea")
  const sourceJobId = jobIdFromUrl(jobUrl)
  if (!jobUrl || !sourceJobId) return
  const heading = doc.querySelector<HTMLElement>('main [data-sentry-component="TitleContent"] h1')
  const jobTitle = heading?.textContent?.trim()
  if (!heading || !jobTitle) return
  const match = /^(.*?)\s+채용\s+-\s+([\s\S]+?)\s*\|\s*잡코리아\s*$/.exec(doc.title.trim())
  if (!match) return
  const companyName = match[1]?.trim()
  const title = match[2]?.trim()
  // A stale SPA document title must not attach another company's metadata.
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim()
  if (!companyName || !title || normalize(title) !== normalize(jobTitle)) return
  return { platform: "jobkorea", sourceJobId, jobUrl, companyName, jobTitle, element: heading.parentElement || heading }
}
