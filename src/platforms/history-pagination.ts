import type { Platform } from "../core/model"
import { DateSchema } from "../core/model"
import { platformForUrl } from "../core/urls"
import { platformDefinitions } from "../core/platforms"
import { rememberHistoryContext } from "./remember-history"

export function isBuiltInHistoryUrl(raw: string, platform: Platform): boolean {
  if (platformForUrl(raw) !== platform) return false
  const url = new URL(raw), definition = platformDefinitions[platform]
  return url.hostname === definition.host && definition.historyPath.test(url.pathname)
}
const positive = (value: string | null | undefined) => value && /^[1-9]\d*$/.test(value) && Number(value) <= 100000 ? Number(value) : undefined
function pageQuery(url: URL) {
  const platform = platformForUrl(url.href)
  const keys = platform ? platformDefinitions[platform].pageKeys.filter(key => key !== "offset") : ["page"]
  const values = [...url.searchParams].filter(([key]) => keys.includes(key.toLowerCase())).map(([, value]) => positive(value))
  return { present: values.length > 0, value: values.length && values.every(value => value && value === values[0]) ? values[0] : undefined }
}
const queryValue = (url: URL, key: string) => [...url.searchParams].find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1]
function urlPage(url: URL): number | undefined {
  const path = positive(url.pathname.match(/\/page\/(\d+)\/?$/i)?.[1])
  const parsedQuery = pageQuery(url), query = parsedQuery.value
  if (parsedQuery.present && !query) return undefined
  const limit = positive(url.searchParams.get("limit")), offset = url.searchParams.get("offset")
  const offsetPage = platformForUrl(url.href) === "wanted" && limit && offset !== null && /^\d+$/.test(offset) && Number(offset) % limit === 0 ? Number(offset) / limit + 1 : undefined
  if ((path && query && path !== query) || (offsetPage && query && offsetPage !== query)) return undefined
  return query || path || offsetPage
}
export function historyFilterKey(raw: string): string {
  const url = new URL(raw)
  const platform = platformForUrl(raw)
  const pageKeys = platform ? platformDefinitions[platform].pageKeys : ["page"]
  const params = [...url.searchParams].filter(([key]) => !pageKeys.includes(key.toLowerCase())).sort(([a,av], [b,bv]) => a.localeCompare(b) || av.localeCompare(bv))
  return JSON.stringify([url.origin, url.pathname.replace(/\/page\/\d+\/?$/i, "").replace(/\/$/, "").toLowerCase(), params])
}
const visible = (element: Element) => !element.closest('[hidden],[aria-hidden="true"]') && !(element instanceof HTMLElement && (element.style.display === "none" || element.style.visibility === "hidden"))
const enabled = (element: Element) => visible(element) && !element.closest('[disabled],[aria-disabled="true"]')
const paginationSelector = 'nav[aria-label*="페이지"],nav[aria-label*="pagination" i],[role=navigation][aria-label*="페이지"],[role=navigation][aria-label*="pagination" i]'
const inspectedPagination = (platform: Platform) => platform === "jobkorea" ? ".applyCont .tplPagination" : platform === "saramin" ? "#apply_status_list_div .PageBox" : undefined

// Initial entry URLs omit the site's default date/status filters, while its
// pagination hrefs include them. Resolve that context from the inspected page
// controls, without reading inputs or inventing filter values. Explicit URL
// filters must still agree, and all qualifying links must have one context.
export function historyContextUrl(doc: Document, platform: Platform, base = doc.URL): string {
  if (platform === "remember" && isBuiltInHistoryUrl(base, platform)) return rememberHistoryContext(doc, base).url
  const selector = inspectedPagination(platform)
  if (!selector || !isBuiltInHistoryUrl(base, platform)) return base
  const current = new URL(base), pageKeys = platformDefinitions[platform].pageKeys
  const explicit = [...current.searchParams].filter(([key]) => !pageKeys.includes(key.toLowerCase()))
  const targets = [...doc.querySelectorAll(`${selector} a[data-page][href]`)].flatMap(link => {
    if (!positive(link.getAttribute("data-page"))) return []
    try {
      const url = new URL(link.getAttribute("href")!, base)
      return isBuiltInHistoryUrl(url.href, platform) && explicit.every(([key, value]) => queryValue(url, key) === value) ? [url.href] : []
    } catch { return [] }
  })
  return targets.length && targets.every(target => historyFilterKey(target) === historyFilterKey(targets[0]!)) ? targets[0]! : base
}
// In a detected page group, click the site's own in-place control. Its handler
// text is never parsed or evaluated by the extension.
const localAnchor = (element: Element) => element.matches("a[href]") && /^(?:#.*|javascript:[\s\S]*)?$/i.test(element.getAttribute("href")?.trim() || "")
function navigationLink(element: Element, platform: Platform, base: string, context = base): boolean {
  if (!element.matches("a[href]")) return false
  try {
    const target = new URL(element.getAttribute("href")!, base)
    const current = new URL(base)
    const pageKeys = platformDefinitions[platform].pageKeys
    const locationKey = (url: URL) => JSON.stringify([url.pathname.toLowerCase(), [...url.searchParams].filter(([key]) => pageKeys.includes(key.toLowerCase())).map(([key, value]) => [key.toLowerCase(), value]).sort()])
    // A fragment or reordered query is not a new history page. In particular,
    // ApplyMng?Page=1# must never be mistaken for Page=2.
    return isBuiltInHistoryUrl(target.href, platform) && historyFilterKey(target.href) === historyFilterKey(platform === "remember" ? base : context) && locationKey(target) !== locationKey(current)
  } catch { return false }
}
export interface HistoryPagination {
  currentPage?: number
  totalPages?: number
  pageSize?: number
  scope: string
  hasNextPage: boolean
  hasFirstPage: boolean
  paginationFound: boolean
  endKnown: boolean
  next?: HTMLElement
  first?: HTMLElement
}
export function historyPagination(doc: Document, platform: Platform, base = doc.URL): HistoryPagination {
  const url = new URL(base)
  const context = historyContextUrl(doc, platform, base)
  const links = [...doc.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(link => navigationLink(link, platform, base, context))
  const numeric = (el: Element) => positive(el.getAttribute("data-page")) || positive(el.textContent?.trim())
  const groups = new Set(doc.querySelectorAll(paginationSelector))
  const inspectedSelector = inspectedPagination(platform)
  const inspectedGroups = inspectedSelector && isBuiltInHistoryUrl(base, platform) ? [...doc.querySelectorAll(inspectedSelector)] : []
  inspectedGroups.forEach(group => groups.add(group))
  // Wanted uses div/ul rows and explicit English-labelled page buttons rather
  // than a semantic nav. Restrict this addition to the inspected history body.
  if (platform === "wanted" && isBuiltInHistoryUrl(base, platform)) {
    for (const button of doc.querySelectorAll('section[class*="Body_Body__"] button[aria-label]')) {
      if (/^(?:Next|Previous) page$/i.test(button.getAttribute("aria-label") || "") && button.parentElement) groups.add(button.parentElement)
    }
  }
  const markers = [...doc.querySelectorAll('[aria-current="page"],[aria-selected="true"],strong')].filter(element => numeric(element) && visible(element))
  for (const marker of markers) {
    const parent = marker.parentElement
    if (parent && !parent.matches("main,body,html") && [...parent.children].some(element => numeric(element) && (element.matches("button") || localAnchor(element) || links.includes(element as HTMLAnchorElement)))) groups.add(parent)
  }
  const inGroup = (element: Element) => [...groups].some(group => group.contains(element))
  const marked = markers.find(element => element.matches('[aria-current="page"]') || inGroup(element))
  const disabled = [...groups].flatMap(group => [...group.querySelectorAll('button[disabled],button[aria-disabled="true"],a[aria-disabled="true"]')]).filter(element => numeric(element) && visible(element))
  const spans = [...groups].flatMap(group => {
    const candidates = [...group.querySelectorAll("span")].filter(element => numeric(element) && visible(element) && !element.closest("a,button,[role=button]") && ![...element.children].some(child => numeric(child)))
    return candidates.length === 1 ? candidates : []
  })
  const active = marked || (disabled.length === 1 ? disabled[0] : undefined) || (spans.length === 1 ? spans[0] : undefined)
  const definition = platformDefinitions[platform]
  const query = pageQuery(url), fromUrl = urlPage(url)
  // Jobkorea's bare ApplyMng entry is the first page. Once Page is present,
  // its explicit value wins over a stale DOM marker; invalid values stay unknown.
  const fallback = !query.present && isBuiltInHistoryUrl(base, platform) ? definition.defaultHistoryPage : undefined
  const currentPage = definition.preferUrlPage && query.present ? fromUrl : active ? numeric(active) : fromUrl ?? fallback
  const controls = [...new Set([...doc.querySelectorAll<HTMLElement>("a[href]"), ...[...groups].flatMap(group => [...group.querySelectorAll<HTMLElement>("button,[role=button]")])])]
  const label = (element: Element) => (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || element.querySelector("img[alt]")?.getAttribute("alt") || "").trim().replace(/\s+/g, " ")
  const validControl = (element: Element) => element.matches("a") ? navigationLink(element, platform, base, context) || localAnchor(element) && inGroup(element) : inGroup(element)
  const nextControl = controls.find(element => (element.getAttribute("rel")?.split(/\s+/).includes("next") || /^(?:다음(?:\s*페이지)?|next(?:\s*page)?|[›»>])$/i.test(label(element))) && validControl(element))
  const numericControls = controls.filter(element => enabled(element) && validControl(element) && numeric(element))
  const numberedNext = currentPage ? numericControls.find(element => numeric(element) === currentPage + 1) : undefined
  const next = numberedNext || (nextControl && enabled(nextControl) ? nextControl : undefined)
  const first = controls.find(element => enabled(element) && validControl(element) && (element.getAttribute("rel")?.split(/\s+/).includes("first") || /^(?:처음(?:\s*페이지)?|첫\s*페이지|first(?:\s*page)?)$/i.test(label(element)))) || numericControls.find(element => numeric(element) === 1)
  const last = controls.find(element => validControl(element) && (element.getAttribute("rel")?.split(/\s+/).includes("last") || /^(?:마지막(?:\s*페이지)?|last(?:\s*page)?)$/i.test(label(element))))
  const inspectedNumbers = inspectedGroups.flatMap(group => [...group.querySelectorAll("a[data-page],span.now,:scope > span.BtnType")]).filter(visible).map(numeric).filter((page): page is number => !!page)
  const inspectedEnd = !!currentPage && inspectedNumbers.includes(currentPage) && inspectedNumbers.every(page => page <= currentPage) && !next
  const totalPages = last?.matches("a[href]") ? urlPage(new URL(last.getAttribute("href")!, base)) : inspectedEnd ? currentPage : undefined
  const [startKey, endKey] = definition.historyDateKeys || ["start_date", "end_date"]
  const start = DateSchema.safeParse(queryValue(new URL(context), startKey)), end = DateSchema.safeParse(queryValue(new URL(context), endKey))
  const period = platform === "remember" ? rememberHistoryContext(doc, base).period || "현재 조회 조건" : start.success && end.success ? `${start.data} ~ ${end.data}` : "현재 조회 조건"
  const pathPage = positive(url.pathname.match(/\/page\/(\d+)\/?$/i)?.[1]), queryPage = query.value
  const ambiguous = !active && (query.present && !queryPage || pathPage && queryPage && pathPage !== queryPage)
  const scope = `${period} · ${currentPage ? `${currentPage}${totalPages ? ` / ${totalPages}` : ""}페이지` : ambiguous ? "페이지 번호 확인 필요" : "현재 페이지"}`
  return {
    currentPage, totalPages, pageSize: positive(url.searchParams.get("pageCount") || url.searchParams.get("limit")), scope,
    next, first, hasNextPage: !!next, hasFirstPage: !!first,
    paginationFound: !!active || !!nextControl || !!last || numericControls.length > 0,
    endKnown: !!nextControl && !enabled(nextControl) || !!currentPage && !!totalPages && currentPage === totalPages
  }
}

// Jobkorea's Page URL was supplied by the user. Use that public navigation
// contract after finding an actual page control, preserving every current
// query/filter and avoiding placeholder/JavaScript link no-ops.
export function historyNavigationUrl(platform: Platform, base: string, pagination: HistoryPagination, operation: "NEXT_PAGE" | "FIRST_PAGE"): string | undefined {
  if (platform !== "jobkorea" || !isBuiltInHistoryUrl(base, platform)) return undefined
  if (!(operation === "FIRST_PAGE" ? pagination.first : pagination.next)) return undefined
  const page = operation === "FIRST_PAGE" ? 1 : pagination.currentPage && pagination.currentPage + 1
  if (!page || page > 100000) return undefined
  const control = operation === "FIRST_PAGE" ? pagination.first : pagination.next
  const href = control?.getAttribute("href")
  // Prefer the site's inspected href: it includes default filters missing
  // from a fresh ApplyMng?Page=1 entry. Placeholder controls retain fallback.
  if (control?.closest(".applyCont .tplPagination") && href) {
    try {
      const target = new URL(href, base)
      if (isBuiltInHistoryUrl(target.href, platform) && urlPage(target) === page) { target.hash = ""; return target.href }
    } catch { /* Fall through to the existing placeholder-link handling. */ }
  }
  const url = new URL(base)
  for (const key of [...url.searchParams.keys()]) if (platformDefinitions[platform].pageKeys.includes(key.toLowerCase())) url.searchParams.delete(key)
  url.searchParams.set("Page", String(page)); url.hash = ""
  return url.href
}
