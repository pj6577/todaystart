export const searchPlatforms = ["saramin", "jobkorea", "wanted"] as const
export type SearchPlatform = typeof searchPlatforms[number]

export const searchLimits = { pages: 1000, rows: 50, timeoutMs: 20000, maxBytes: 6 * 1024 * 1024, queryLength: 100 } as const

export interface SearchJob {
  id: string
  platform: SearchPlatform
  companyName: string
  jobTitle: string
  jobUrl: string
  location?: string
  career?: string
  deadline?: string
}

export type SearchStatus = "ok" | "empty" | "unreadable" | "blocked" | "login_required" | "timeout" | "error" | "cancelled"
export interface SearchPage {
  jobs: SearchJob[]
  hasNext: boolean
  status: SearchStatus
  message?: string
  matching?: boolean
}
export interface SiteSearchResult extends SearchPage {
  platform: SearchPlatform
  page: number
  searchUrl: string
}

export function appendSearchJobs(previous: SearchJob[], next: SearchJob[]): SearchJob[] {
  return [...new Map([...previous, ...next].map(job => [job.id, job])).values()]
}
