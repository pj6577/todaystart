import React from "react"
import { careerRangeError, clearSearchCareer, searchCareers, searchCareerLabel, searchCareerYears, setSearchCareerRange, toggleSearchCareer, type SearchFilters } from "../search/filters"
import { Button } from "./primitives/button"
import { NativeSelect } from "./primitives/input"
import { FilterOption } from "./job-search-filter-option"

type CareerChoice = Pick<SearchFilters, "career" | "careerMin" | "careerMax">
const presets: { label: string; value: CareerChoice }[] = [
  { label: "전체", value: { career: [] } },
  { label: "신입", value: { career: ["new"] } },
  { label: "신입~3년", value: { career: ["new", "experienced"], careerMin: 0, careerMax: 3 } },
  { label: "2~5년", value: { career: ["experienced"], careerMin: 2, careerMax: 5 } },
  { label: "5년 이상", value: { career: ["experienced"], careerMin: 5 } }
]

export function CareerFilterPanel({ value, onChange }: { value: SearchFilters; onChange(value: SearchFilters): void }) {
  const error = careerRangeError(value)
  const summary = value.career.map(career => searchCareerLabel(career, value)).join(" · ") || "경력 전체"
  return <div className="filter-modal-career">
    <div className="career-presets" role="group" aria-label="빠른 경력 조건">{presets.map(preset => <Button key={preset.label} variant="outline" aria-pressed={value.careerMin === preset.value.careerMin && value.careerMax === preset.value.careerMax && value.career.length === preset.value.career.length && preset.value.career.every(career => value.career.includes(career))} onClick={() => onChange({ ...clearSearchCareer(value), ...preset.value })}>{preset.label}</Button>)}</div>
    <fieldset className="career-inclusions"><legend>포함할 경력</legend>{searchCareers.filter(career => career.id !== "all").map(career => <FilterOption key={career.id} label={`${career.label} 포함`} checked={value.career.includes(career.id)} onChange={() => onChange(toggleSearchCareer(value, career.id))}>{career.label} 포함</FilterOption>)}</fieldset>
    <fieldset className="career-year-range"><legend>경력 연차</legend><div>
      <label>최소 경력<NativeSelect aria-label="최소 경력" aria-invalid={!!error} value={value.careerMin ?? (!value.career.length || value.career.includes("new") ? 0 : "")} onChange={event => onChange(setSearchCareerRange(value, "careerMin", event.target.value ? Number(event.target.value) : undefined))}><option value="0">신입</option><option value="">제한 없음</option>{searchCareerYears.map(year => <option key={year} value={year}>{year}년</option>)}</NativeSelect></label><span aria-hidden="true">~</span>
      <label>최대 경력<NativeSelect aria-label="최대 경력" aria-invalid={!!error} value={value.careerMax ?? ""} onChange={event => onChange(setSearchCareerRange(value, "careerMax", event.target.value ? Number(event.target.value) : undefined))}><option value="">제한 없음</option>{searchCareerYears.map(year => <option key={year} value={year}>{year}년</option>)}</NativeSelect></label>
    </div></fieldset>
    {error ? <p className="career-range-error" role="alert">{error}</p> : <p className="career-selection-summary" role="status"><span>선택한 조건</span><strong>{summary}</strong></p>}
  </div>
}
