import type { JobPosting } from "../core/model"
import { jobIdFromUrl, safeJobUrl } from "../core/urls"

// Observed current Jobkorea detail on 2026-10-20: the sticky Title contains
// only the job h1. The document title names the company separately. Never use
// recommendation cards or guess a company from the position's bracket prefix.
export function jobkoreaDetailPosting(doc: Document): JobPosting | undefined {
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
