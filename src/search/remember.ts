import type { DevelopmentRoleId, JobGroupId, SearchFilters } from "./filters"
import categories from "./remember-categories.json"

// Public native taxonomy: /v2/open_profiles/options?version=2, read 2026-11-03.
// Only category IDs/names are bundled; no profile data or runtime taxonomy request.
const category = (...names: (keyof typeof categories)[]) => names.flatMap(name => categories[name].map(role => role.id))
const groupRoles: Record<JobGroupId, number[]> = {
  development: category("SW개발", "AI·데이터"), planning: [...category("경영·전략·기획"), 164, 165, 168],
  design: category("디자인/UX"), marketing: [...category("마케팅·광고", "홍보·대외협력"), 425, 426, 427, 428, 429, 430],
  hr: category("HR·총무").filter(id => id !== 199 && id !== 200), finance: category("재무·회계·세무"),
  office: [...category("법무·컴플라이언스"), 199, 200], sales: category("영업"),
  logistics: [422, 423, 424, 432, 433, 434, 435, 436], transport: [437], service: category("생활·로컬 서비스직"),
  production: category("생산·제조"), research: category("연구개발직(R&D)", "설계직·엔지니어링"),
  education: category("교육"), construction: category("건설·부동산"), medical: category("의료·보건", "제약·바이오"),
  media: category("방송·미디어·문화"), public: [...category("공직자·종교인"), 497], customer: [167], banking: category("금융")
}
const roleIds: Record<DevelopmentRoleId, number[]> = {
  frontend: [311], backend: [310], web: [310, 311, 312], app: [313, 314, 315, 317], data: [343], analyst: [345],
  scientist: [339, 344], security: [324], system: [323, 325, 326, 327], game: [316], publisher: [321], qa: [336]
}
const locations: Record<SearchFilters["region"][number], string[]> = {
  seoul: ["서울특별시"], gyeonggi: ["경기도"], incheon: ["인천광역시"], busan: ["부산광역시"], daegu: ["대구광역시"],
  daejeon: ["대전광역시"], ulsan: ["울산광역시"], sejong: ["세종특별자치시"], gangwon: ["강원도"],
  chungbuk: ["충청북도"], chungnam: ["충청남도"], jeonbuk: ["전라북도"], jeonnam: ["전라남도", "광주광역시"],
  gyeongbuk: ["경상북도"], gyeongnam: ["경상남도"], jeju: ["제주특별자치도"]
}
type Career = { career_year?: -1; min_experience?: number; max_experience?: number }
export function rememberCareers(filters: SearchFilters): Career[] {
  const fresh = filters.career.includes("new"), experienced = filters.career.includes("experienced"), any = filters.career.includes("any")
  const bounded = filters.careerMin !== undefined || filters.careerMax !== undefined
  if ((!filters.career.length && !bounded) || (fresh && experienced && any && !bounded)) return [{}]
  const ranges: Career[] = []
  const min = Math.max(1, filters.careerMin ?? 1)
  if (fresh && (!experienced || min > 1)) ranges.push({ min_experience: 0, max_experience: 0 })
  if (experienced) ranges.push({ min_experience: fresh && min === 1 ? 0 : min, ...(filters.careerMax !== undefined ? { max_experience: filters.careerMax } : {}) })
  // career_year=-1 overrides min/max in the native API. OR it with separate requests.
  if (any) ranges.push({ career_year: -1 })
  return ranges
}

export function rememberSearchUrls(keyword: string, page: number, filters: SearchFilters) {
  const roles = [...new Set([...filters.group.flatMap(id => groupRoles[id]), ...filters.role.flatMap(id => roleIds[id])])]
  const addresses = [...new Set(filters.region.flatMap(id => locations[id]))].map(name => [name])
  const common = { ...(keyword ? { keywords: [keyword] } : {}), ...(roles.length ? { job_category_ids: roles } : {}),
    ...(addresses.length ? { addresses } : {}), include_applied_job_posting: true }
  const careers = rememberCareers(filters)
  const bodies = careers.map(career => JSON.stringify({ page, per: 30, sort: "starts_at_desc", search: { ...common, ...career } }))
  const names = Object.entries(categories).flatMap(([level1, children]) => children.filter(child => roles.includes(child.id)).map(child => ({ level1, level2: child.name })))
  const search = new URL("https://career.rememberapp.co.kr/job/postings")
  // The native page has a single career selector; the extension retains all OR branches.
  const career = careers.length === 1 ? careers[0] : undefined
  search.searchParams.set("search", JSON.stringify({ ...(keyword ? { keywords: [keyword] } : {}),
    ...(names.length ? { jobCategoryNames: names } : {}), ...(addresses.length ? { addresses } : {}),
    ...(career?.career_year !== undefined ? { careerYear: career.career_year } : {}),
    ...(career?.min_experience !== undefined ? { minExperience: career.min_experience } : {}),
    ...(career?.max_experience !== undefined ? { maxExperience: career.max_experience } : {}) }))
  return { searchUrl: search.href, requestUrl: "https://career-api.rememberapp.co.kr/job_postings/search", format: "json" as const,
    method: "POST" as const, bodies }
}
