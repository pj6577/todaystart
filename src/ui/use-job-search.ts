import { useCallback, useEffect, useRef, useState } from "react"
import { requestSearchPage } from "../search/client"
import { appendSearchJobs, searchLimits, searchPlatforms, type SearchJob, type SearchPlatform, type SearchStatus } from "../search/model"
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

export function useJobSearch() {
  const [sites, setSites] = useState<SearchSiteState[]>([])
  const [feed, setFeed] = useState<SearchJob[]>([])
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
      setFeed([])
      setSubmitted(criteria)
      setSites(targets.map(({ platform, page }) => ({ platform, page: 0, requestedPage: page, jobs: [], hasNext: false, status: "loading" })))
    } else setSites(sites => sites.map(site => {
      const target = targets.find(target => target.platform === site.platform)
      return target ? { ...site, requestedPage: target.page, status: "loading", message: undefined } : site
    }))
    void Promise.all(targets.map(async ({ platform, page }) => {
      const result = await requestSearchPage(platform, criteria.query, page, current.controller.signal, undefined, criteria.filters, current.wanted)
      if (run.current.id !== current.id || current.controller.signal.aborted) return
      const success = result.status === "ok" || result.status === "empty"
      if (success) setFeed(feed => appendSearchJobs(feed, result.jobs))
      setSites(sites => sites.map(site => {
        if (site.platform !== platform) return site
        const known = new Set(site.jobs.map(job => job.id))
        const repeated = success && result.jobs.length > 0 && result.jobs.every(job => known.has(job.id))
        return { ...site, status: result.status, message: result.message, matching: result.matching,
          jobs: success ? appendSearchJobs(site.jobs, result.jobs) : site.jobs,
          page: success ? page : site.page, hasNext: success ? result.hasNext && !repeated : site.hasNext }
      }))
    })).finally(() => { if (run.current.id === current.id) run.current.loading = false })
  }, [])

  const search = useCallback((criteria: Criteria, selected: SearchPlatform[]) => fetchPages(searchPlatforms.filter(platform => selected.includes(platform)).map(platform => ({ platform, page: 1 })), criteria, true), [fetchPages])
  const stop = useCallback(() => {
    run.current.id++; run.current.controller.abort(); run.current.loading = false
    setPaused(true)
    setSites(sites => sites.map(site => site.status === "loading" ? { ...site, status: "cancelled" } : site))
  }, [])
  const clear = useCallback(() => {
    run.current.id++; run.current.controller.abort(); run.current.loading = false
    setSites([]); setFeed([]); setPaused(false)
    run.current.wanted = new WantedIntersection()
    setSubmitted({ query: "", filters: { ...defaultSearchFilters } })
  }, [])
  const retry = useCallback((site: SearchSiteState) => fetchPages([{ platform: site.platform, page: site.requestedPage }], submitted), [fetchPages, submitted])
  const moreSites = sites.filter(site => site.hasNext && ["ok", "cancelled"].includes(site.status) && site.page < searchLimits.pages)
  const loadMore = useCallback((platform: SearchPlatform | "all") => fetchPages(sites.filter(site => site.hasNext && ["ok", "cancelled"].includes(site.status) && site.page < searchLimits.pages && (platform === "all" || site.platform === platform)).map(site => ({ platform: site.platform, page: site.page + 1 })), submitted), [sites, submitted, fetchPages])
  return { sites, feed, submitted, paused, search, stop, clear, retry, loadMore, moreSites, busy: sites.some(site => site.status === "loading") }
}
