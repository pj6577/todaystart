export const platformIds = ["saramin", "jobkorea", "wanted", "remember"] as const
export type OnlinePlatform = typeof platformIds[number]
interface PlatformDefinition {
  label: string
  host: string
  additionalHosts?: string[]
  historyUrl: string
  historyPath: RegExp
  listingPaths: string[]
  listingPages?: { host: string; path: RegExp }[]
  detailPaths: string[]
  jobPath?: RegExp
  companyPath?: RegExp
  jobQueryId?: string
  pageKeys: string[]
  defaultHistoryPage?: number
  preferUrlPage?: boolean
  historyDateKeys?: [string, string]
}
// Register behavior here; UI, adapters, URLs and defaults share this registry.
// Chrome host permissions remain an explicit build-time declaration.
export const platformDefinitions: Record<OnlinePlatform, PlatformDefinition> = {
  saramin: {
    label: "사람인", host: "www.saramin.co.kr",
    historyUrl: "https://www.saramin.co.kr/zf_user/persons/apply-status-list",
    historyPath: /^\/zf_user\/persons\/apply-status-list(?:\/page\/[1-9]\d*)?\/?$/i,
    listingPaths: ["/zf_user/search", "/zf_user/jobs/list"], detailPaths: ["/zf_user/jobs/relay/view", "/zf_user/jobs/relay/pop-view"],
    jobPath: /^\/zf_user\/jobs\/relay\/(?:pop-)?view\/?$/i, companyPath: /^\/zf_user\/company-info\/(?:view|summary)\/?$/i,
    jobQueryId: "rec_idx", pageKeys: ["page"], defaultHistoryPage: 1
  },
  jobkorea: {
    label: "잡코리아", host: "www.jobkorea.co.kr", historyUrl: "https://www.jobkorea.co.kr/User/ApplyMng?Page=1",
    historyPath: /^\/user\/applymng\/?$/i, listingPaths: ["/recruit/joblist", "/search"], detailPaths: ["/recruit/gi_read"],
    jobPath: /^\/recruit\/gi_read\/\d+\/?$/i, companyPath: /^\/recruit\/co_read\/c\//i,
    pageKeys: ["page", "pageno", "pagenum", "pageindex"], defaultHistoryPage: 1, preferUrlPage: true,
    historyDateKeys: ["From_Dt", "To_Dt"]
  },
  wanted: {
    label: "원티드", host: "www.wanted.co.kr",
    historyUrl: "https://www.wanted.co.kr/status/applications/applied?q&start_date=&end_date=&page=1&offset=0&limit=10",
    historyPath: /^\/status\/applications\/applied\/?$/i,
    listingPaths: ["/wdlist"], detailPaths: ["/wd"], jobPath: /^\/wd\/\d+\/?$/i, companyPath: /^\/company\/\d+\/?$/i,
    pageKeys: ["page", "offset"], defaultHistoryPage: 1
  },
  remember: {
    label: "리멤버", host: "profile.rememberapp.co.kr",
    additionalHosts: ["career.rememberapp.co.kr"],
    historyUrl: "https://profile.rememberapp.co.kr/applies",
    historyPath: /^\/applies\/?$/i,
    // Profile history and career listings live on separate, exact hosts.
    listingPaths: [], listingPages: [{ host: "career.rememberapp.co.kr", path: /^\/job\/postings\/?$/i }],
    jobPath: /^\/job\/posting\/\d+\/?$/i,
    detailPaths: [], pageKeys: ["page"], defaultHistoryPage: 1
  }
}
export const platformHostPatterns = platformIds.flatMap(id => [platformDefinitions[id].host, ...(platformDefinitions[id].additionalHosts || [])].map(host => `https://${host}/*`))
