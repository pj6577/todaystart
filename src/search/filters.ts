// Codes read from the public search controls on 2026-11-02, not inferred from keywords.
// Source taxonomies differ: these broad groups map to the closest native categories.
export const jobGroups = [
  { id: "all", label: "전체 직군", saramin: "", jobkorea: "" },
  { id: "development", label: "IT개발·데이터", saramin: "2", jobkorea: "10031" },
  { id: "planning", label: "기획·전략", saramin: "16", jobkorea: "10026" },
  { id: "design", label: "디자인", saramin: "15", jobkorea: "10032" },
  { id: "marketing", label: "마케팅·상품기획·MD", saramin: "14,12", jobkorea: "10030" },
  { id: "hr", label: "인사·HR", saramin: "5", jobkorea: "10028" },
  { id: "finance", label: "회계·세무·재무", saramin: "3", jobkorea: "10029" },
  { id: "office", label: "총무·법무·사무", saramin: "4", jobkorea: "10027" },
  { id: "sales", label: "영업·판매", saramin: "8", jobkorea: "10035" },
  { id: "logistics", label: "구매·물류·무역", saramin: "18", jobkorea: "10033" },
  { id: "transport", label: "운전·운송·배송", saramin: "7", jobkorea: "10034" },
  { id: "service", label: "서비스·식음료", saramin: "10", jobkorea: "10038,10039" },
  { id: "production", label: "제조·생산", saramin: "11", jobkorea: "10041" },
  { id: "research", label: "연구·엔지니어링", saramin: "9", jobkorea: "10040" },
  { id: "education", label: "교육", saramin: "19", jobkorea: "10042" },
  { id: "construction", label: "건설·건축·시설", saramin: "22", jobkorea: "10043" },
  { id: "medical", label: "의료·바이오", saramin: "6", jobkorea: "10044" },
  { id: "media", label: "미디어·문화·스포츠", saramin: "13", jobkorea: "10045" },
  { id: "public", label: "공공·복지", saramin: "20", jobkorea: "10046" },
  { id: "customer", label: "고객상담·TM", saramin: "21", jobkorea: "10036" },
  { id: "banking", label: "금융·보험", saramin: "17", jobkorea: "10037" }
] as const

export const developmentRoles = [
  { id: "all", label: "세부 직무 전체", saramin: "", jobkorea: "" },
  { id: "frontend", label: "프론트엔드", saramin: "92", jobkorea: "1000230" },
  { id: "backend", label: "백엔드·서버", saramin: "84", jobkorea: "1000229" },
  { id: "web", label: "웹개발", saramin: "87", jobkorea: "1000231" },
  { id: "app", label: "앱개발", saramin: "86", jobkorea: "1000232" },
  { id: "data", label: "데이터엔지니어", saramin: "83", jobkorea: "1000236" },
  { id: "analyst", label: "데이터분석", saramin: "82", jobkorea: "1000418" },
  { id: "scientist", label: "데이터 사이언티스트", saramin: "2248", jobkorea: "1000237" },
  { id: "security", label: "정보보안", saramin: "90", jobkorea: "1000238" },
  { id: "system", label: "시스템엔지니어", saramin: "100", jobkorea: "1000233" },
  { id: "game", label: "게임개발", saramin: "80", jobkorea: "1000240" },
  { id: "publisher", label: "웹퍼블리셔", saramin: "91", jobkorea: "1000245" },
  { id: "qa", label: "QA·테스터", saramin: "99", jobkorea: "1000247" }
] as const

export const searchRegions = [
  { id: "all", label: "지역 전체", saramin: "", jobkorea: "" },
  { id: "seoul", label: "서울", saramin: "101000", jobkorea: "I000" },
  { id: "gyeonggi", label: "경기", saramin: "102000", jobkorea: "B000" },
  { id: "incheon", label: "인천", saramin: "108000", jobkorea: "K000" },
  { id: "busan", label: "부산", saramin: "106000", jobkorea: "H000" },
  { id: "daegu", label: "대구", saramin: "104000", jobkorea: "F000" },
  { id: "daejeon", label: "대전", saramin: "105000", jobkorea: "G000" },
  { id: "ulsan", label: "울산", saramin: "107000", jobkorea: "J000" },
  { id: "sejong", label: "세종", saramin: "118000", jobkorea: "1000" },
  { id: "gangwon", label: "강원", saramin: "109000", jobkorea: "A000" },
  { id: "chungbuk", label: "충북", saramin: "114000", jobkorea: "P000" },
  { id: "chungnam", label: "충남", saramin: "115000", jobkorea: "O000" },
  { id: "jeonbuk", label: "전북", saramin: "113000", jobkorea: "M000" },
  { id: "jeonnam", label: "전남·광주", saramin: "112000", jobkorea: "L000" },
  { id: "gyeongbuk", label: "경북", saramin: "111000", jobkorea: "D000" },
  { id: "gyeongnam", label: "경남", saramin: "110000", jobkorea: "C000" },
  { id: "jeju", label: "제주", saramin: "116000", jobkorea: "N000" }
] as const
export const searchCareers = [
  { id: "all", label: "경력 전체" }, { id: "new", label: "신입" },
  { id: "experienced", label: "경력" }, { id: "any", label: "경력무관" }
] as const

export type JobGroupId = Exclude<typeof jobGroups[number]["id"], "all">
export type DevelopmentRoleId = Exclude<typeof developmentRoles[number]["id"], "all">
export interface SearchFilters {
  group: readonly JobGroupId[]
  role: readonly DevelopmentRoleId[]
  region: readonly Exclude<typeof searchRegions[number]["id"], "all">[]
  career: readonly Exclude<typeof searchCareers[number]["id"], "all">[]
  careerMin?: number
  careerMax?: number
}
export const defaultSearchFilters: Readonly<SearchFilters> = { group: [], role: [], region: [], career: [] }
export const hasCareerRange = (filters: SearchFilters) => filters.careerMin !== undefined || filters.careerMax !== undefined
export const hasSearchCareerFilters = (filters: SearchFilters) => !!filters.career.length || hasCareerRange(filters)
export const hasSearchFilters = (filters: SearchFilters) => !!(filters.group.length || filters.role.length || filters.region.length) || hasSearchCareerFilters(filters)
export const toggleFilterValue = <T extends string>(values: readonly T[], value: T): T[] => values.includes(value) ? values.filter(item => item !== value) : [...values, value]
export const searchCareerYears = Array.from({ length: 20 }, (_, index) => index + 1)

export function careerRangeError(filters: SearchFilters): string | undefined {
  if (filters.careerMin !== undefined && (!Number.isInteger(filters.careerMin) || filters.careerMin < 0 || filters.careerMin > 20)) return "최소 경력은 신입~20년 사이에서 선택해 주세요."
  if (filters.careerMax !== undefined && (!Number.isInteger(filters.careerMax) || filters.careerMax < 1 || filters.careerMax > 20)) return "최대 경력은 1~20년 사이에서 선택해 주세요."
  if (filters.careerMin !== undefined && filters.careerMax !== undefined && filters.careerMin >= filters.careerMax) return "최대 경력은 최소 경력보다 크게 선택해 주세요."
}
export function clearSearchCareer(filters: SearchFilters): SearchFilters {
  return { ...filters, career: [], careerMin: undefined, careerMax: undefined }
}
export function toggleSearchCareer(filters: SearchFilters, career: SearchFilters["career"][number]): SearchFilters {
  const selected = toggleFilterValue(filters.career, career)
  return { ...filters, career: selected,
    ...(career === "new" && !selected.includes("new") && filters.careerMin === 0 ? { careerMin: undefined } : {}),
    ...(career === "experienced" && !selected.includes(career) ? { careerMin: undefined, careerMax: undefined } : {}) }
}
export function setSearchCareerRange(filters: SearchFilters, bound: "careerMin" | "careerMax", year?: number): SearchFilters {
  let career = [...filters.career]
  if (bound === "careerMin" && year !== undefined) career = year === 0 ? [...career, "new"] : career.filter(value => value !== "new")
  if (bound === "careerMax" && year !== undefined && filters.careerMin === undefined && !filters.career.length) career.push("new")
  if (year !== undefined) career.push("experienced")
  career = [...new Set(career)].sort((a, b) => searchCareers.findIndex(item => item.id === a) - searchCareers.findIndex(item => item.id === b))
  return { ...filters, [bound]: year, career }
}
export function searchCareerLabel(career: SearchFilters["career"][number], filters: SearchFilters): string {
  if (career !== "experienced") return searchCareers.find(item => item.id === career)!.label
  const min = filters.careerMin, max = filters.careerMax
  return min !== undefined && min > 0 && max !== undefined ? `경력 ${min}~${max}년` : min !== undefined && min > 0 ? `경력 ${min}년 이상` : max !== undefined ? `경력 ${max}년 이하` : "경력"
}

// A whole category and a subset of its roles must never broaden the same search.
export function toggleSearchGroup(filters: SearchFilters, group: JobGroupId): SearchFilters {
  return { ...filters, group: toggleFilterValue(filters.group, group), role: group === "development" ? [] : filters.role }
}
export function toggleSearchRole(filters: SearchFilters, role: DevelopmentRoleId): SearchFilters {
  return { ...filters, group: filters.group.filter(group => group !== "development"), role: toggleFilterValue(filters.role, role) }
}

export function checkedSearchFilters(filters: SearchFilters): SearchFilters {
  function check<T extends string>(values: readonly T[], options: readonly { id: string }[]): T[] {
    if (!Array.isArray(values) || values.length > options.length || values.some(value => value === "all" || !options.some(option => option.id === value))) throw new Error("검색 조건을 다시 선택해 주세요.")
    return [...new Set(values)]
  }
  const role = check(filters.role, developmentRoles)
  const error = careerRangeError(filters)
  if (error) throw new Error(error)
  const career = check(filters.career, searchCareers)
  if (filters.careerMin === 0 && !career.includes("new")) career.unshift("new")
  if (hasCareerRange(filters) && !career.includes("experienced")) career.push("experienced")
  return { group: check(filters.group, jobGroups).filter(group => group !== "development" || !role.length), role,
    region: check(filters.region, searchRegions), career,
    ...(filters.careerMin !== undefined ? { careerMin: filters.careerMin } : {}), ...(filters.careerMax !== undefined ? { careerMax: filters.careerMax } : {}) }
}
