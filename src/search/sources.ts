import { searchLimits, type SearchPlatform } from "./model"
import { checkedSearchFilters, defaultSearchFilters, developmentRoles, hasSearchFilters, jobGroups, searchRegions, type SearchFilters } from "./filters"
import jobkoreaGroups from "./jobkorea-groups.json"
import { wantedSearchUrls } from "./wanted"

export function searchUrls(platform: SearchPlatform, query: string, page = 1, selected: SearchFilters = defaultSearchFilters) {
  const filters = checkedSearchFilters(selected)
  const keyword = query.trim()
  if ((!keyword && !hasSearchFilters(filters)) || keyword.length > searchLimits.queryLength) throw new Error("검색어를 입력하거나 검색 조건을 선택해 주세요.")
  if (!Number.isInteger(page) || page < 1 || page > searchLimits.pages) throw new Error("검색 페이지 범위를 벗어났습니다.")
  const groups = jobGroups.filter(item => item.id !== "all" && filters.group.includes(item.id))
  const roles = developmentRoles.filter(item => item.id !== "all" && filters.role.includes(item.id))
  const regions = searchRegions.filter(item => item.id !== "all" && filters.region.includes(item.id))
  const codes = (values: string[]) => [...new Set(values.flatMap(value => value.split(",")).filter(Boolean))].join(",")
  if (platform === "saramin") {
    const url = new URL("https://www.saramin.co.kr/zf_user/search")
    url.search = new URLSearchParams({ searchword: keyword, recruitPage: String(page), recruitPageCount: "20" }).toString()
    if (roles.length) url.searchParams.set("cat_kewd", codes(roles.map(role => role.saramin)))
    if (groups.length) url.searchParams.set("cat_mcls", codes(groups.map(group => group.saramin)))
    if (regions.length) url.searchParams.set("loc_mcd", codes(regions.map(region => region.saramin)))
    if (filters.career.includes("any")) url.searchParams.set("exp_none", "y")
    const experience = filters.career.filter(career => career !== "any").map(career => career === "new" ? "1" : "2")
    if (experience.length) url.searchParams.set("exp_cd", codes(experience))
    // Saramin represents entry level with exp_cd=1, rather than exp_min=0.
    if (filters.careerMin !== undefined && filters.careerMin > 0) url.searchParams.set("exp_min", String(filters.careerMin))
    if (filters.careerMax !== undefined) url.searchParams.set("exp_max", String(filters.careerMax))
    return { searchUrl: url.href, requestUrl: url.href, format: "html" as const }
  }
  if (platform === "jobkorea") {
    const url = new URL("https://www.jobkorea.co.kr/Search/")
    url.search = new URLSearchParams({ stext: keyword, tabType: "recruit", Page_No: String(page) }).toString()
    // The UI's five-digit group IDs are navigation nodes, not valid duty filters.
    // Expand them to the seven-digit selectable duties from /Search/api/codes/jobClassification.
    const duties = groups.flatMap(group => group.jobkorea.split(",").flatMap(code => jobkoreaGroups[code as keyof typeof jobkoreaGroups] || []))
    if (roles.length || duties.length) url.searchParams.set("duty", codes([...roles.map(role => role.jobkorea), ...duties]))
    if (regions.length) url.searchParams.set("local", codes(regions.map(region => region.jobkorea)))
    if (filters.career.length) url.searchParams.set("careerType", codes(filters.career.map(career => career === "new" ? "1" : career === "experienced" ? "2" : "4")))
    if (filters.careerMin !== undefined) url.searchParams.set("careerMin", String(filters.careerMin))
    if (filters.careerMax !== undefined) url.searchParams.set("careerMax", String(filters.careerMax))
    return { searchUrl: url.href, requestUrl: url.href, format: "html" as const }
  }
  if (platform !== "wanted") throw new Error("지원하지 않는 검색 사이트입니다.")
  return wantedSearchUrls(keyword, page, filters)
}
