import type { DevelopmentRoleId, JobGroupId, SearchFilters } from "./filters"
import groups from "./wanted-groups.json"

// Native /wdlist taxonomy and filter/navigation metadata read on 2026-11-02.
// Expand category selections to roles so several categories can share one request.
const category = (...ids: (keyof typeof groups)[]) => ids.flatMap(id => groups[id])
const groupRoles: Record<JobGroupId, number[]> = {
  development: category("518", "10566"), planning: [564, 559, 565, 563, 554, 10115, 570, 569, 794, 798, 567, 568, 791, 10120],
  design: category("511"), marketing: [...category("523"), 10232], hr: category("517"),
  finance: [...category("508"), 1034, 10116], office: [...category("521"), 552, 562, 10122, 550, 557],
  sales: category("530"), logistics: category("532"), transport: [777, 779, 786, 780, 781, 784, 788, 778, 785, 789, 10236, 10237],
  service: category("510", "10057"), production: category("522"), research: category("513"), education: category("10101"),
  construction: category("509"), medical: category("515"), media: category("524"), public: category("514"),
  customer: category("510"), banking: category("508")
}
const roleIds: Record<DevelopmentRoleId, number[]> = {
  frontend: [669], backend: [872], web: [873], app: [677, 678, 10111], data: [655], analyst: [656],
  scientist: [1024], security: category("10566"), system: [674, 665], game: [961, 960, 878, 897, 962], publisher: [939], qa: [676]
}
const locations: Record<SearchFilters["region"][number], string[]> = {
  seoul: ["seoul.all"], gyeonggi: ["gyeonggi.all"], incheon: ["incheon.all"], busan: ["busan.all"], daegu: ["daegu.all"],
  daejeon: ["daejeon.all"], ulsan: ["ulsan.all"], sejong: ["sejong.all"], gangwon: ["gangwon.all"],
  chungbuk: ["n-chungcheong.all"], chungnam: ["s-chungcheong.all"], jeonbuk: ["n-jeolla.all"],
  jeonnam: ["s-jeolla.all", "gwangju.all"], gyeongbuk: ["n-gyeongsang.all"], gyeongnam: ["s-gyeongsang.all"], jeju: ["jeju.all"]
}
export const wantedPageSize = 12
export function wantedYears(filters: SearchFilters): number[] {
  // Wanted's native 'all' option includes jobs without an experience restriction.
  if (filters.career.includes("any") || (!filters.career.length && filters.careerMin === undefined && filters.careerMax === undefined)) return [-1]
  const years: number[] = []
  if (filters.career.includes("new") || filters.careerMin === 0) years.push(0)
  if (filters.career.includes("experienced") || filters.careerMin !== undefined || filters.careerMax !== undefined) {
    for (let year = Math.max(1, filters.careerMin ?? 1); year <= (filters.careerMax ?? 20); year++) years.push(year)
  }
  return years.length ? years : [-1]
}

export function wantedSearchUrls(keyword: string, page: number, filters: SearchFilters) {
  const roles = [...new Set([...filters.group.flatMap(id => groupRoles[id]), ...filters.role.flatMap(id => roleIds[id])])]
  const params = new URLSearchParams({ country: "kr", limit: String(wantedPageSize), offset: String((page - 1) * wantedPageSize) })
  for (const year of wantedYears(filters)) params.append("years", String(year))
  for (const location of [...new Set(filters.region.flatMap(id => locations[id]))]) params.append("locations", location)
  const listing = new URL("https://www.wanted.co.kr/api/chaos/navigation/v1/results")
  listing.search = params.toString()
  listing.searchParams.set("job_sort", "job.latest_order")
  for (const id of roles) listing.searchParams.append("job_ids", String(id))
  const request = new URL("https://www.wanted.co.kr/api/chaos/search/v1/position")
  request.search = params.toString(); request.searchParams.set("query", keyword); request.searchParams.set("sort", "job.latest_order")
  const search = new URL(keyword ? "https://www.wanted.co.kr/search" : "https://www.wanted.co.kr/wdlist/all")
  search.search = params.toString(); search.searchParams.delete("limit"); search.searchParams.delete("offset")
  if (keyword) { search.searchParams.set("query", keyword); search.searchParams.set("tab", "position") }
  else { search.searchParams.set("job_sort", "job.latest_order"); for (const id of roles) search.searchParams.append("selected", String(id)) }
  // Keyword search ignores job_ids. Verify membership against the server's
  // category-filtered stream instead of discarding the user's keyword/filters.
  return { searchUrl: search.href, requestUrl: keyword ? request.href : listing.href, format: "json" as const,
    ...(keyword && roles.length ? { comparisonUrl: listing.href } : {}) }
}
