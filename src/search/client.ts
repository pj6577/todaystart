import { appendSearchJobs, searchLimits, type SearchPlatform, type SiteSearchResult } from "./model"
import { searchUrls } from "./sources"
import { parseSearchHtml, parseWantedSearch } from "./parser"
import { defaultSearchFilters, type SearchFilters } from "./filters"
import { WantedIntersection } from "./wanted-intersection"
import { parseRememberSearch } from "./remember-parser"

async function readText(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > searchLimits.maxBytes) throw new Error("응답 크기가 데모 처리 범위를 넘었습니다.")
  if (!response.body) throw new Error("검색 응답이 비어 있습니다.")
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let bytes = 0, text = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > searchLimits.maxBytes) { await reader.cancel(); throw new Error("응답 크기가 데모 처리 범위를 넘었습니다.") }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally { reader.releaseLock() }
}

// Runs in the trusted extension page (DOMParser is unavailable in the MV3 worker).
// No cookies, API keys, proxy, persistent storage, automatic retry or tab creation.
export async function requestSearchPage(platform: SearchPlatform, query: string, page: number, signal: AbortSignal, request: typeof fetch = fetch, filters: SearchFilters = defaultSearchFilters, wantedSession?: WantedIntersection): Promise<SiteSearchResult> {
  const urls = searchUrls(platform, query, page, filters)
  const base = { platform, page, searchUrl: urls.searchUrl, jobs: [], hasNext: false }
  const controller = new AbortController()
  const cancel = () => controller.abort()
  let timedOut = false
  if (signal.aborted) controller.abort()
  signal.addEventListener("abort", cancel, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, searchLimits.timeoutMs)
  try {
    if (controller.signal.aborted) return { ...base, status: "cancelled", message: "검색을 중지했습니다." }
    const load = async (requestUrl: string, requestBody?: string): Promise<SiteSearchResult> => {
      const response = await request(requestUrl, {
        method: requestBody === undefined ? "GET" : "POST", ...(requestBody !== undefined ? { body: requestBody } : {}),
        credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
        headers: { Accept: urls.format === "json" ? "application/json" : "text/html", ...(requestBody !== undefined ? { "Content-Type": "application/json" } : {}) }, signal: controller.signal
      })
      if ([403, 429].includes(response.status)) return { ...base, status: "blocked", message: response.status === 429 ? "사이트 요청 한도에 도달했습니다. 잠시 후 다시 검색해 주세요. (HTTP 429)" : "사이트에서 직접 요청을 허용하지 않았습니다. (HTTP 403)" }
      if (response.status === 401) return { ...base, status: "login_required", message: "사이트 로그인이 필요한 응답입니다." }
      if (!response.ok) return { ...base, status: "error", message: `검색 요청에 실패했습니다. (HTTP ${response.status})` }
      const body = await readText(response)
      if (controller.signal.aborted) throw new Error("aborted")
      if (urls.format === "json") {
        let value: unknown
        try { value = JSON.parse(body) } catch { return { ...base, status: "unreadable", message: "공고 목록 대신 다른 응답이 도착했습니다. 사이트에서 검색을 확인해 주세요." } }
        return { ...base, ...(platform === "remember" ? parseRememberSearch(value, page) : parseWantedSearch(value, page)) }
      }
      return { ...base, ...parseSearchHtml(platform as "saramin" | "jobkorea", body, urls.searchUrl, page) }
    }
    if ("bodies" in urls) {
      const parts = await Promise.all(urls.bodies.map(body => load(urls.requestUrl, body)))
      if (controller.signal.aborted) throw new Error("aborted")
      const failed = parts.find(part => part.status !== "ok" && part.status !== "empty")
      if (failed) return failed
      const jobs = parts.reduce((jobs, part) => appendSearchJobs(jobs, part.jobs), [] as SiteSearchResult["jobs"])
      const hasNext = parts.some(part => part.hasNext)
      return { ...base, jobs, hasNext, status: jobs.length || hasNext ? "ok" : "empty", ...(!jobs.length && !hasNext ? { message: "검색 결과가 없습니다." } : {}) }
    }
    if ("comparisonUrl" in urls && urls.comparisonUrl) {
      const session = wantedSession ?? new WantedIntersection()
      session.prepare(JSON.stringify([query.trim(), filters]))
      const cached = session.cached(page)
      if (cached) return { ...base, ...cached }
      const exhausted = { ...base, status: "empty" as const }
      const [keyword, category] = await Promise.all([
        session.keywordDone ? exhausted : load(urls.requestUrl),
        session.categoryDone ? exhausted : load(urls.comparisonUrl)
      ])
      if (controller.signal.aborted) throw new Error("aborted")
      return { ...base, ...session.merge(page, keyword, category) }
    }
    return await load(urls.requestUrl)
  } catch (error) {
    return { ...base, status: signal.aborted ? "cancelled" : timedOut ? "timeout" : "error", message: signal.aborted ? "검색을 중지했습니다." : timedOut ? "응답 시간이 초과되었습니다. 다시 시도해 주세요." : error instanceof Error && error.message.includes("데모 처리 범위") ? error.message : "직접 요청에 실패했습니다. 네트워크·접근 제한을 확인해 주세요." }
  } finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); controller.abort() }
}
