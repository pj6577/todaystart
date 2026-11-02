import { z } from "zod"
import { safeJobUrl, jobIdFromUrl } from "../core/urls"
import { readField } from "../platforms/parser"
import { publicPostingPages } from "../platforms/public-postings"
import { searchLimits, type SearchJob, type SearchPage, type SearchPlatform } from "./model"

const clean = (value?: string | null) => value?.replace(/\s+/g, " ").trim().slice(0, 300) || undefined
const text = (root: Element | Document, selector: string) => clean(root.querySelector(selector)?.textContent)

function job(platform: SearchPlatform, companyName: string | undefined, jobTitle: string | undefined, rawUrl: string | undefined, base: string): SearchJob | undefined {
  const jobUrl = safeJobUrl(rawUrl, platform, base), sourceId = jobIdFromUrl(jobUrl)
  if (!companyName || !jobTitle || !jobUrl || !sourceId || !/^\d+$/.test(sourceId)) return
  const path = new URL(jobUrl).pathname
  if (!(platform === "saramin" ? /^\/zf_user\/jobs\/relay\/(?:pop-)?view\/?$/i : platform === "jobkorea" ? /^\/recruit\/gi_read\/\d+\/?$/i : /^\/wd\/\d+\/?$/).test(path)) return
  return { id: `${platform}:${sourceId}`, platform, companyName, jobTitle, jobUrl }
}

export function parseSearchHtml(platform: Exclude<SearchPlatform, "wanted">, html: string, base: string, page: number): SearchPage {
  // Parse an inert document, discard scripts/styles/embedded resources, and return text + canonical links only.
  const inert = html.replace(/<(script|style|svg|iframe|object|video|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(?:img|link|base|embed|source|frame)\b[^>]*>/gi, "")
  const doc = new DOMParser().parseFromString(inert, "text/html")
  const title = doc.title.toLowerCase()
  if (/captcha|access denied|just a moment|접근.{0,8}(?:제한|차단)|보안.{0,8}확인/.test(title) || doc.querySelector('#challenge-form, [name="cf-turnstile-response"], .g-recaptcha')) {
    return { jobs: [], hasNext: false, status: "blocked", message: "사이트에서 접근 확인이 필요합니다. 검색 페이지를 직접 확인해 주세요." }
  }
  const profile = platform === "saramin" ? publicPostingPages.saraminSearch.profile : publicPostingPages.jobkoreaSearch.profile
  const root = doc.querySelector(profile.root), jobs: SearchJob[] = [], seen = new Set<string>()
  const rows = root ? [...root.querySelectorAll(profile.posting)] : []
  for (const row of rows.slice(0, searchLimits.rows)) {
    const item = job(platform, clean(readField(row, profile.fields.company)), clean(readField(row, profile.fields.title)), readField(row, profile.fields.url), base)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    if (platform === "saramin") {
      const conditions = [...row.querySelectorAll(".job_condition > span")].map(element => clean(element.textContent))
      item.location = conditions[0]; item.career = conditions[1]; item.deadline = text(row, ".job_date .date")
    } else {
      item.location = text(row, '[data-sentry-component="GrayChip"]')
      item.career = [...row.querySelectorAll("span")].map(element => clean(element.textContent)).find(value => value && /^(?:신입|경력무관|경력(?:\s|\d|$))/.test(value) && value.length < 35)
    }
    jobs.push(item)
  }
  if (jobs.length) {
    const hasNext = platform === "saramin"
      ? !!root?.querySelector(`.pagination a[page="${page + 1}"]`)
      : [...(root?.querySelectorAll("a[href]") || [])].some(link => {
        try { return new URL(link.getAttribute("href")!, base).searchParams.get("Page_No") === String(page + 1) }
        catch { return false }
      })
    return { jobs, status: "ok", hasNext: hasNext && page < searchLimits.pages }
  }
  if (/로그인|sign in/i.test(doc.title) || doc.querySelector('form input[type="password"]')) return { jobs: [], hasNext: false, status: "login_required", message: "로그인이 필요한 응답입니다. 사이트에서 검색 결과를 확인해 주세요." }
  // An unrecognized response is never reported as zero jobs. Restrict empty detection to the actual results region.
  const emptyText = root && clean(root.textContent)
  const empty = !rows.length && !!emptyText && /(?:검색\s*결과가?\s*(?:없|0)|검색된\s*(?:채용)?\s*(?:정보|공고)가?\s*없|총\s*0\s*건)/.test(emptyText)
  return { jobs: [], hasNext: false, status: empty ? "empty" : "unreadable", message: empty ? "검색 결과가 없습니다." : "검색 응답에서 공고를 읽지 못했습니다. 사이트 구조나 응답을 확인해야 합니다." }
}

const wantedRow = z.object({
  id: z.number().int().positive(), position: z.string().trim().min(1),
  company: z.object({ name: z.string().trim().min(1) }),
  address: z.object({ location: z.string().nullable().optional(), district: z.string().nullable().optional() }).nullable().optional(),
  annual_from: z.number().nonnegative().nullable().optional(), annual_to: z.number().nonnegative().nullable().optional()
})
const wantedResponse = z.object({ data: z.array(z.unknown()), links: z.object({ next: z.string().nullable().optional() }).optional() })

export function parseWantedSearch(raw: unknown, page: number): SearchPage {
  const parsed = wantedResponse.safeParse(raw)
  if (!parsed.success) return { jobs: [], hasNext: false, status: "unreadable", message: "원티드 검색 응답 형식을 읽지 못했습니다." }
  const jobs: SearchJob[] = [], seen = new Set<string>()
  for (const value of parsed.data.data.slice(0, searchLimits.rows)) {
    const row = wantedRow.safeParse(value)
    if (!row.success) continue
    const { id, position, company, address, annual_from: from, annual_to: to } = row.data
    const item = job("wanted", clean(company.name), clean(position), `https://www.wanted.co.kr/wd/${id}`, "https://www.wanted.co.kr/search")
    if (!item || seen.has(item.id)) continue
    item.location = [address?.location, address?.district].map(value => clean(value)).filter(Boolean).join(" ") || undefined
    item.career = from === 0 && to === 0 ? "신입" : from != null && to != null ? to >= 100 ? from === 0 ? "신입 이상" : `${from}년↑` : from === 0 ? `신입~${to}년` : `${from}~${to}년` : undefined
    seen.add(item.id); jobs.push(item)
  }
  const empty = parsed.data.data.length === 0
  return { jobs, hasNext: jobs.length > 0 && !!parsed.data.links?.next && page < searchLimits.pages, status: empty ? "empty" : jobs.length ? "ok" : "unreadable", message: empty ? "검색 결과가 없습니다." : !jobs.length ? "원티드 공고 항목을 읽지 못했습니다." : undefined }
}
