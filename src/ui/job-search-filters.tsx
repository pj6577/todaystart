import React, { useRef, useState } from "react"
import { defaultSearchFilters, developmentRoles, hasSearchCareerFilters, hasSearchFilters, jobGroups, searchCareerLabel, searchRegions, toggleSearchCareer, type SearchFilters } from "../search/filters"
import { searchPlatforms, type SearchPlatform } from "../search/model"
import { platformLabel } from "../core/model"
import { Button } from "./primitives/button"
import { SearchFilterModal, type SearchFilterSection } from "./job-search-filter-modal"
import { Icon } from "./components"

interface FilterProps {
  value: SearchFilters
  sites: SearchPlatform[]
  endControl?: React.ReactNode
  onChange(filters: SearchFilters): void
  onApply(filters: SearchFilters, sites: SearchPlatform[]): void
}

export function JobSearchFilters({ value, onChange, sites, onApply, endControl }: FilterProps) {
  const [section, setSection] = useState<SearchFilterSection>()
  const trigger = useRef<HTMLButtonElement | null>(null)
  const jobLabels = [...value.group.map(id => jobGroups.find(group => group.id === id)!.label), ...value.role.map(id => developmentRoles.find(role => role.id === id)!.label)]
  const buttons: { section: SearchFilterSection; label: string; summary: string; active: boolean }[] = [
    { section: "job", label: "직군·직무", summary: jobLabels.join(" · ") || "전체 직군", active: !!jobLabels.length },
    { section: "region", label: "지역", summary: value.region.map(id => searchRegions.find(region => region.id === id)!.label).join(" · ") || "지역 전체", active: !!value.region.length },
    { section: "career", label: "경력", summary: value.career.map(id => searchCareerLabel(id, value)).join(" · ") || "경력 전체", active: hasSearchCareerFilters(value) },
    { section: "sites", label: "검색 사이트", summary: sites.map(site => platformLabel[site]).join(" · "), active: sites.length !== searchPlatforms.length }
  ]
  const chips = [
    ...value.group.map(id => ({ key: `group:${id}`, label: jobGroups.find(group => group.id === id)!.label, remove: () => onChange({ ...value, group: value.group.filter(group => group !== id) }) })),
    ...value.role.map(id => ({ key: `role:${id}`, label: developmentRoles.find(role => role.id === id)!.label, remove: () => onChange({ ...value, role: value.role.filter(role => role !== id) }) })),
    ...value.region.map(id => ({ key: `region:${id}`, label: searchRegions.find(region => region.id === id)!.label, remove: () => onChange({ ...value, region: value.region.filter(region => region !== id) }) })),
    ...value.career.map(id => ({ key: `career:${id}`, label: searchCareerLabel(id, value), remove: () => onChange(toggleSearchCareer(value, id)) }))
  ]
  return <div className="job-search-condition-panel">
    <div className="job-search-condition-toolbar">
    <div className="job-search-condition-grid">{buttons.map(button => <Button key={button.section} variant="outline" className={`search-filter-trigger${button.active ? " is-active" : ""}`} aria-label={button.label} aria-description={button.summary} aria-haspopup="dialog" aria-expanded={section === button.section} onClick={event => { trigger.current = event.currentTarget; setSection(button.section) }}>
      {button.label}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </Button>)}</div>
    {endControl}
    </div>
    {hasSearchFilters(value) && <div className="search-selected-filters" aria-label="적용한 검색 조건">{chips.map(chip => <Button variant="unstyled" className="search-selected-chip" key={chip.key} aria-label={`${chip.label} 조건 해제`} onClick={chip.remove}>{chip.label}<Icon name="close" size={12} /></Button>)}<Button variant="link" className="search-clear-filters" onClick={() => onChange({ ...defaultSearchFilters })}>전체 초기화</Button></div>}
    {section && <SearchFilterModal initialSection={section} value={value} sites={sites} onSectionChange={setSection} onClose={() => setSection(undefined)} onApply={onApply} returnFocus={trigger.current} />}
  </div>
}
