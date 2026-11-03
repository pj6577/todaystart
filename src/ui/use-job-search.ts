import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { requestSearchPage } from "../search/client"
import { appendSearchJobs, searchLimits, searchPlatforms, type SearchJob, type SearchPlatform, type SearchStatus, type SiteSearchResult } from "../search/model"
import { defaultSearchFilters, type SearchFilters } from "../search/filters"
import { WantedIntersection } from "../search/wanted-intersection"

interface Criteria { query: string; filters: SearchFilters }
export interface SearchSiteState {
  platform: SearchPlatform
  jobs: SearchJob[]
  page: number
  requestedPage: number
  hasNext: boolean
  status: SearchStatus | "loading"
  message?: string
  matching?: boolean
}

function applyResult(site: SearchSiteState, result: SiteSearchResult): SearchSiteState {
  const success = result.status === "ok" || result.status === "empty"
  const known = new Set(site.jobs.map(job => job.id))
  const repeated = success && result.jobs.length > 0 && result.jobs.every(job => known.has(job.id))
  return { ...site, status: result.status, message: result.message, matching: result.matching,
    jobs: success ? appendSearchJobs(site.jobs, result.jobs) : site.jobs,
    page: success ? result.page : site.page, hasNext: success ? result.hasNext && !repeated : site.hasNext }
}

// Keep previously displayed batches in place. Refresh known IDs in their old
// batch, and append genuinely new postings as one continuation batch.
function appendBatch(previous: SearchJob[][], next: SearchJob[]): SearchJob[][] {
  const fresh = new Map(next.map(job => [job.id, job]))
  const batches = previous.map(batch => batch.map(job => {
    const updated = fresh.get(job.id); fresh.delete(job.id)
    return updated ?? job
  }))
  return fresh.size ? [...batches, [...fresh.values()]] : batches
}

export function useJobSearch() {
  const [sites, setSites] = useState<SearchSiteState[]>([])
  const [batches, setBatches] = useState<SearchJob[][]>([])
  const feed = useMemo(() => batches.flat(), [batches])
  const [submitted, setSubmitted] = useState<Criteria>({ query: "", filters: { ...defaultSearchFilters } })
  const [paused, setPaused] = useState(false)
  const run = useRef({ id: 0, controller: new AbortController(), loading: false, wanted: new WantedIntersection() })
  useEffect(() => () => { run.current.id++; run.current.controller.abort() }, [])

  const fetchPages = useCallback((targets: { platform: SearchPlatform; page: number }[], criteria: Criteria, replace = false) => {
    if ((!replace && run.current.loading) || !targets.length) return
    run.current.controller.abort()
    const current = { id: run.current.id + 1, controller: new AbortController(), loading: true, wanted: replace ? new WantedIntersection() : run.current.wanted }
    run.current = current
    setPaused(false)
    if (replace) {
      setBatches([])
      setSubmitted(criteria)
      setSites(targets.map(({ platform, page }) => ({ platform, page: 0, requestedPage: page, jobs: [], hasNext: false, status: "loading" })))
    } else setSites(sites => sites.map(site => {
      const target = targets.find(target => target.platform === site.platform)
      return target ? { ...site, requestedPage: target.page, status: "loading", message: undefined } : site
    }))
    let completed = 0
    void Promise.all(targets.map(async ({ platform, page }) => {
      const result = await requestSearchPage(platform, criteria.query, page, current.controller.signal, undefined, criteria.filters, current.wanted)
      if (run.current.id !== current.id || current.controller.signal.aborted) return result
      completed++
      if (replace) {
        // First results can appear immediately. Continuation batches below are
        // committed together, so a fast last platform cannot hide new cards.
        if (completed === targets.length) current.loading = false
        if (result.status === "ok" || result.status === "empty") setBatches(batches => [appendSearchJobs(batches[0] ?? [], result.jobs)])
        setSites(sites => sites.map(site => site.platform === platform ? applyResult(site, result) : site))
      }
      return result
    })).then(results => {
      if (run.current.id !== current.id || current.controller.signal.aborted) return
      current.loading = false
      if (replace) return
      const success = results.filter(result => result.status === "ok" || result.status === "empty")
      setBatches(batches => appendBatch(batches, success.flatMap(result => result.jobs)))
      setSites(sites => sites.map(site => {
        const result = results.find(result => result.platform === site.platform)
        return result ? applyResult(site, result) : site
      }))
    }).finally(() => { if (run.current.id === current.id) current.loading = false })
  }, [])

  const search = useCallback((criteria: Criteria, selected: SearchPlatform[]) => fetchPages(searchPlatforms.filter(platform => selected.includes(platform)).map(platform => ({ platform, page: 1 })), criteria, true), [fetchPages])
  const stop = useCallback(() => {
    run.current.id++; run.current.controller.abort(); run.current.loading = false
    setPaused(true)
    setSites(sites => sites.map(site => site.status === "loading" ? { ...site, status: "cancelled" } : site))
  }, [])
  const clear = useCallback(() => {
    run.current.id++; run.current.controller.abort(); run.current.loading = false
    setSites([]); setBatches([]); setPaused(false)
    run.current.wanted = new WantedIntersection()
    setSubmitted({ query: "", filters: { ...defaultSearchFilters } })
  }, [])
  const retry = useCallback((site: SearchSiteState) => fetchPages([{ platform: site.platform, page: site.requestedPage }], submitted), [fetchPages, submitted])
  const moreSites = sites.filter(site => site.hasNext && ["ok", "cancelled"].includes(site.status) && site.page < searchLimits.pages)
  const loadMore = useCallback((platform: SearchPlatform | "all") => fetchPages(sites.filter(site => site.hasNext && ["ok", "cancelled"].includes(site.status) && site.page < searchLimits.pages && (platform === "all" || site.platform === platform)).map(site => ({ platform: site.platform, page: site.page + 1 })), submitted), [sites, submitted, fetchPages])
  return { sites, feed, batches, submitted, paused, search, stop, clear, retry, loadMore, moreSites, busy: sites.some(site => site.status === "loading") }
}
