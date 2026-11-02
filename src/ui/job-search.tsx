import React, { useEffect, useMemo, useRef, useState } from "react"
import { platformLabel, type ApplicationRecord } from "../core/model"
import { applicationHistoryIndex, searchCompanyNameKey } from "../search/application-history"
import { searchLimits, type SearchPlatform } from "../search/model"
import { hasSearchFilters, type SearchFilters } from "../search/filters"
import { readSearchPreferences, saveSearchPreferences, type SearchPreferences } from "../search/preferences"
import { Icon } from "./components"
import { PlatformSymbol } from "./platform-logo"
import { Input } from "./primitives/input"
import { Button } from "./primitives/button"
import { Card } from "./primitives/card"
import { JobSearchFilters } from "./job-search-filters"
import { JobSearchHistoryDialog } from "./job-search-history-dialog"
import { useJobSearch } from "./use-job-search"
import "./job-search.css"

const failureLabels = { unreadable: "응답 확인 필요", blocked: "접근 제한", login_required: "로그인 필요", timeout: "응답 지연", error: "요청 실패", unsupported: "조건 검색 연결 전" }

export function JobSearch({ records }: { records: ApplicationRecord[] }) {
  const [initial] = useState(readSearchPreferences)
  const confirmed = useRef(initial)
  const [query, setQuery] = useState(initial.query)
  const [selected, setSelected] = useState<SearchPlatform[]>(initial.sites)
  const [conditions, setConditions] = useState<SearchFilters>(initial.filters)
  const [filter, setFilter] = useState<SearchPlatform | "all">("all")
  const [validation, setValidation] = useState("")
  const [excludeApplied, setExcludeApplied] = useState(initial.excludeApplied)
  const [nearEnd, setNearEnd] = useState(false)
  const [historyCompany, setHistoryCompany] = useState<{ name: string; key: string }>()
  const sentinel = useRef<HTMLDivElement>(null)
  const lastAutoLoad = useRef("")
  const { sites, feed, paused, search, stop, clear, retry, loadMore, moreSites, busy } = useJobSearch()
  const history = useMemo(() => applicationHistoryIndex(records), [records])
  const availableJobs = useMemo(() => excludeApplied ? feed.filter(job => !history.has(searchCompanyNameKey(job.companyName))) : feed, [feed, history, excludeApplied])
  const jobs = useMemo(() => availableJobs.filter(job => filter === "all" || job.platform === filter), [availableJobs, filter])
  const hasMore = moreSites.some(site => filter === "all" || site.platform === filter)
  const failures = sites.filter(site => site.status in failureLabels)

  useEffect(() => {
    if (!sentinel.current) return
    const observer = new IntersectionObserver(([entry]) => setNearEnd(!!entry?.isIntersecting), { rootMargin: "0px 0px 240px 0px" })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    // The observer may still report the empty/loading layout for one frame.
    // Recheck the rendered sentinel before starting another network batch.
    const bounds = sentinel.current?.getBoundingClientRect()
    const progress = `${filter}:${excludeApplied}:${jobs.length}`
    if (nearEnd && bounds && bounds.top <= window.innerHeight + 240 && bounds.bottom >= 0 && !busy && !paused && hasMore && jobs.length > 0 && lastAutoLoad.current !== progress) {
      lastAutoLoad.current = progress
      loadMore(filter)
    }
  }, [nearEnd, busy, paused, hasMore, loadMore, filter, excludeApplied, jobs.length])

  function remember(filters: SearchFilters, platforms: SearchPlatform[], keyword = query.trim()) {
    const preferences: SearchPreferences = { query: keyword, filters, sites: platforms, excludeApplied }
    confirmed.current = preferences
    saveSearchPreferences(preferences)
  }
  function performSearch(filters = conditions, platforms = selected) {
    const keyword = query.trim()
    if ((!keyword && !hasSearchFilters(filters)) || keyword.length > searchLimits.queryLength || !platforms.length) { setValidation("검색어 또는 검색 조건과 검색할 사이트를 선택해 주세요."); return }
    remember(filters, platforms, keyword)
    setFilter("all"); setValidation(""); lastAutoLoad.current = ""
    search({ query: keyword, filters: { ...filters } }, platforms)
  }
  function applyFilters(filters: SearchFilters, platforms: SearchPlatform[]) {
    setConditions(filters)
    setSelected(platforms)
    if (query.trim() || hasSearchFilters(filters)) performSearch(filters, platforms)
    else { remember(filters, platforms); clear(); setValidation("") }
  }
  function changeExcludeApplied(next: boolean) {
    setExcludeApplied(next)
    confirmed.current = { ...confirmed.current, excludeApplied: next }
    saveSearchPreferences(confirmed.current)
  }

  return <div className="job-search-demo" aria-busy={busy}>
    <form className="job-search-form" onSubmit={event => { event.preventDefault(); performSearch() }} aria-label="채용공고 통합검색">
      <div className="job-search-input"><Icon name="search" size={22} /><Input type="search" aria-label="채용공고 검색어" placeholder="직무, 기술 또는 기업명 (선택)" value={query} maxLength={searchLimits.queryLength} onChange={event => setQuery(event.target.value)} /><Button variant="default" type="submit">{busy ? "새로 검색" : "통합검색"}<Icon name="arrow" size={16} /></Button></div>
      {validation && <p role="alert" className="job-search-error">{validation}</p>}
    </form>
    <div className="job-search-sticky-controls">
      <JobSearchFilters value={conditions} onChange={filters => applyFilters(filters, selected)} sites={selected} onApply={applyFilters}
        endControl={<label className="job-search-exclude"><Input type="checkbox" checked={excludeApplied} onChange={event => changeExcludeApplied(event.target.checked)} />지원 기업 제외하기</label>} />
    </div>

    {!!sites.length && <>
      <div className="job-search-results-toolbar">
      <nav className="job-search-filters" aria-label="검색 결과 사이트 필터">{(["all", ...sites.map(site => site.platform)] as const).map(platform => {
        const count = platform === "all" ? availableJobs.length : availableJobs.filter(job => job.platform === platform).length
        return <Button variant="outline" key={platform} data-search-platform={platform} data-search-status={platform === "all" ? undefined : sites.find(site => site.platform === platform)!.status} data-result-count={count} aria-pressed={filter === platform} onClick={() => setFilter(platform)}>{platform !== "all" && <PlatformSymbol platform={platform} />}{platform === "all" ? "전체" : platformLabel[platform]}</Button>
      })}</nav>
      {busy && <Button variant="ghost" onClick={stop}><Icon name="close" size={14} />검색 중지</Button>}</div>
      {!!failures.length && <div className="job-search-failures">{failures.map(site => <div className="job-search-failure" key={site.platform} role="status" aria-label={`${platformLabel[site.platform]} 검색 문제`} title={site.message}><span>{platformLabel[site.platform]} · {failureLabels[site.status as keyof typeof failureLabels]}</span>{site.status !== "unsupported" && <Button variant="link" size="sm" disabled={busy} onClick={() => retry(site)}>다시 시도</Button>}</div>)}</div>}
    </>}

    {jobs.length ? <div className="job-search-results">{jobs.map(job => {
      const matches = history.get(searchCompanyNameKey(job.companyName)) || [], latest = matches[0]
      return <Card asChild key={job.id}><article className={`job-search-card${latest ? " has-application" : ""}`}>
        <div className="job-search-card-source"><PlatformSymbol platform={job.platform} /><span>{platformLabel[job.platform]}</span>{latest && <Button variant="unstyled" className="job-search-applied-badge" aria-haspopup="dialog" aria-description={`이전 지원 ${matches.length}건 확인`} title={`이전 지원 ${matches.length}건 확인`} onClick={() => setHistoryCompany({ name: job.companyName, key: searchCompanyNameKey(job.companyName) })}><Icon name="check" size={12} />지원 이력 있음</Button>}</div>
        <p className="job-search-company">{job.companyName}</p><h3><a href={job.jobUrl} target="_blank" rel="noreferrer">{job.jobTitle}<Icon name="external" size={14} /></a></h3>
        <div className="job-search-card-meta">{job.location && <span>{job.location}</span>}{job.career && <span>{job.career}</span>}{job.deadline && <span>{job.deadline}</span>}</div>
      </article></Card>
    })}</div> : <div className="job-search-empty"><div className="empty-symbol"><Icon name="search" size={28} /></div><h2>{!sites.length ? "어떤 기회를 찾고 있나요?" : busy ? "공고를 찾고 있어요" : excludeApplied && feed.length ? "지원 이력이 없는 기업의 공고가 없어요" : "검색 결과가 없어요"}</h2>{!sites.length && <p>직군과 지역을 고르거나, 검색어로 공고를 찾아보세요.</p>}</div>}

    <div className="job-search-scroll-end" ref={sentinel} hidden={!sites.length}>
      <p role="status" aria-live="polite">{busy ? "공고를 가져오는 중…" : paused ? "검색을 중지했어요" : !hasMore && jobs.length ? "현재 검색 결과의 끝이에요" : ""}</p>
      {hasMore && <Button variant="outline" disabled={busy} onClick={() => loadMore(filter)}>{paused ? "검색 계속하기" : "다음 공고 가져오기"}</Button>}
    </div>
    {historyCompany && <JobSearchHistoryDialog companyName={historyCompany.name} records={history.get(historyCompany.key) || []} onClose={() => setHistoryCompany(undefined)} />}
  </div>
}
