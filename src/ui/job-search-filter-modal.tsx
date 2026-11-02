import React, { useEffect, useId, useRef, useState } from "react"
import { careerRangeError, defaultSearchFilters, developmentRoles, hasSearchFilters, jobGroups, searchRegions, toggleFilterValue, toggleSearchGroup, toggleSearchRole, type SearchFilters } from "../search/filters"
import { searchPlatforms, type SearchPlatform } from "../search/model"
import { platformLabel } from "../core/model"
import { Dialog, DialogContent, DialogTitle } from "./primitives/dialog"
import { Button } from "./primitives/button"
import { Input } from "./primitives/input"
import { Icon } from "./components"
import { PlatformSymbol } from "./platform-logo"
import { CareerFilterPanel } from "./job-search-career-filter"
import { FilterOption } from "./job-search-filter-option"
import "./job-search-filter-modal.css"

export type SearchFilterSection = "job" | "region" | "career" | "sites"
const sections: { id: SearchFilterSection; label: string; title: string }[] = [
  { id: "job", label: "직무", title: "직군·직무" }, { id: "region", label: "지역", title: "근무 지역" },
  { id: "career", label: "경력", title: "경력" }, { id: "sites", label: "검색 사이트", title: "검색 사이트" }
]

interface FilterModalProps {
  initialSection: SearchFilterSection
  value: SearchFilters
  sites: SearchPlatform[]
  onSectionChange(section: SearchFilterSection): void
  onClose(): void
  onApply(filters: SearchFilters, sites: SearchPlatform[]): void
  returnFocus: HTMLButtonElement | null
}

export function SearchFilterModal({ initialSection, value, sites, onSectionChange, onClose, onApply, returnFocus }: FilterModalProps) {
  const [section, setSection] = useState(initialSection)
  const [draft, setDraft] = useState<SearchFilters>(() => ({ ...value }))
  const [draftSites, setDraftSites] = useState(() => [...sites])
  const [activeGroup, setActiveGroup] = useState<typeof jobGroups[number]["id"]>(() => value.role.length ? "development" : value.group[0] || "all")
  const [query, setQuery] = useState("")
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width:680px)").matches)
  useEffect(() => {
    const media = window.matchMedia("(max-width:680px)")
    const update = () => setNarrow(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  const id = useId(), title = useRef<HTMLHeadingElement>(null)
  const current = sections.find(item => item.id === section)!, group = jobGroups.find(item => item.id === activeGroup)!
  const roles = developmentRoles.filter(role => role.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const regions = searchRegions.filter(region => region.label.includes(query.trim()))
  const changed = hasSearchFilters(draft) || draftSites.length !== searchPlatforms.length
  const careerError = careerRangeError(draft)
  function switchSection(next: SearchFilterSection) { setSection(next); setQuery(""); onSectionChange(next) }

  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="job-search-filter-modal" showClose={false} aria-describedby={undefined}
    onOpenAutoFocus={event => { event.preventDefault(); title.current?.focus() }}
    onEscapeKeyDown={event => { if (event.isComposing) event.preventDefault() }}
    onCloseAutoFocus={event => { event.preventDefault(); if (!document.activeElement?.closest('[role="dialog"]') && returnFocus?.isConnected) returnFocus.focus() }}>
    <aside className="filter-modal-sidebar"><DialogTitle asChild><h2 ref={title} tabIndex={-1}>필터 선택</h2></DialogTitle>
      <div className="filter-modal-navigation" role="tablist" aria-label="필터 종류" aria-orientation={narrow ? "horizontal" : "vertical"}>{sections.map((item, index) => <Button variant="unstyled" role="tab" key={item.id} id={`${id}-${item.id}`} aria-selected={section === item.id} aria-controls={`${id}-panel`} tabIndex={section === item.id ? 0 : -1} onClick={() => switchSection(item.id)} onKeyDown={event => {
        const next = event.key === "ArrowDown" || event.key === "ArrowRight" ? (index + 1) % sections.length : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (index + sections.length - 1) % sections.length : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : undefined
        if (next === undefined) return
        event.preventDefault(); switchSection(sections[next]!.id)
        document.getElementById(`${id}-${sections[next]!.id}`)?.focus()
      }}>{item.label}</Button>)}</div>
    </aside>

    <section className="filter-modal-main"><header className="filter-modal-heading"><div><h3>{current.title}</h3><span className="filter-modal-multi-hint">{section === "career" ? "연차 범위 설정" : "여러 개 선택 가능"}</span></div><Button variant="ghost" size="icon" className="filter-modal-close" aria-label="필터 닫기" onClick={onClose}><Icon name="close" size={19} /></Button></header>
      <div className="filter-modal-content" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${section}`}>
        {section === "job" && <div className="filter-modal-job-picker">
          <fieldset className="filter-modal-groups"><legend className="sr-only">직군 탐색</legend>{jobGroups.map(item => {
            const count = item.id === "development" ? draft.role.length || Number(draft.group.includes("development")) : item.id === "all" ? 0 : Number(draft.group.includes(item.id))
            return <label className={`filter-modal-group${activeGroup === item.id ? " selected" : ""}`} key={item.id}><Input type="radio" className="sr-only" aria-label={item.label} aria-description={count ? `${count}개 선택` : undefined} name={`${id}-group`} checked={activeGroup === item.id} onChange={() => { setActiveGroup(item.id); setQuery("") }} /><span>{item.label}</span>{count > 0 && <span className="filter-modal-group-count" aria-hidden="true">{count}</span>}</label>
          })}</fieldset>
          <div className="filter-modal-job-detail"><div className="filter-modal-category-title"><span className="filter-modal-category-icon"><Icon name={activeGroup === "development" ? "monitor" : "grid"} size={25} /></span><h4>{group.label}</h4></div>
            {activeGroup === "development" ? <>
              <label className="filter-modal-option-search"><Icon name="search" size={15} /><Input type="search" aria-label="세부 직무 검색" placeholder="직무 검색" value={query} onChange={event => setQuery(event.target.value)} /></label>
              <fieldset className="filter-modal-role-chips"><legend className="sr-only">세부 직무</legend>{roles.map(role => <FilterOption key={role.id} label={role.id === "all" ? "IT개발·데이터 전체" : role.label} checked={role.id === "all" ? draft.group.includes("development") : draft.role.includes(role.id)} onChange={() => setDraft(current => role.id === "all" ? toggleSearchGroup(current, "development") : toggleSearchRole(current, role.id))}>{role.id === "all" ? "전체" : role.label}</FilterOption>)}</fieldset>{!roles.length && <p className="filter-modal-empty">일치하는 직무가 없어요.</p>}
            </> : activeGroup === "all" ? <><FilterOption label="전체 직군" checked={!draft.group.length && !draft.role.length} onChange={() => setDraft(current => ({ ...current, group: [], role: [] }))}>전체 직군</FilterOption><p className="filter-modal-description">직군을 선택해 원하는 직무를 찾아보세요.</p></> : <><FilterOption label={`${group.label} 전체`} checked={draft.group.includes(activeGroup)} onChange={() => setDraft(current => toggleSearchGroup(current, activeGroup))}>{group.label} 전체</FilterOption><p className="filter-modal-description">이 직군의 공고를 모두 살펴봐요.</p></>}
          </div>
        </div>}

        {section === "region" && <div className="filter-modal-options"><label className="filter-modal-option-search"><Icon name="search" size={15} /><Input type="search" aria-label="지역 검색" placeholder="지역 이름 검색" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <fieldset className="filter-modal-region-grid"><legend className="sr-only">근무 지역</legend>{regions.map(region => <FilterOption key={region.id} label={region.id === "all" ? "전국" : region.label} checked={region.id === "all" ? !draft.region.length : draft.region.includes(region.id)} onChange={() => setDraft(current => ({ ...current, region: region.id === "all" ? [] : toggleFilterValue(current.region, region.id) }))}>{region.id === "all" ? "전국" : region.label}</FilterOption>)}</fieldset>{!regions.length && <p className="filter-modal-empty">일치하는 지역이 없어요.</p>}
        </div>}

        {section === "career" && <CareerFilterPanel value={draft} onChange={setDraft} />}

        {section === "sites" && <div className="filter-modal-options"><fieldset className="filter-modal-site-grid"><legend className="sr-only">검색할 사이트</legend>{searchPlatforms.map(platform => <label className={`filter-modal-site${draftSites.includes(platform) ? " selected" : ""}`} key={platform}><Input type="checkbox" checked={draftSites.includes(platform)} onChange={() => setDraftSites(current => current.includes(platform) ? current.filter(site => site !== platform) : [...current, platform])} /><PlatformSymbol platform={platform} />{platformLabel[platform]}</label>)}</fieldset>{!draftSites.length && <p className="filter-modal-empty" role="status">사이트를 한 곳 이상 선택해 주세요.</p>}</div>}
      </div>
      <footer className="filter-modal-footer"><Button variant="secondary" disabled={!changed} onClick={() => { setDraft({ ...defaultSearchFilters }); setDraftSites([...searchPlatforms]); setQuery("") }}><Icon name="refresh" size={14} />초기화</Button><div><Button variant="ghost" onClick={onClose}>취소</Button><Button variant="default" disabled={!draftSites.length || !!careerError} title={careerError} onClick={() => { onApply(draft, draftSites); onClose() }}>적용</Button></div></footer>
    </section>
  </DialogContent></Dialog>
}
