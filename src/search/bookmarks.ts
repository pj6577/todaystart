import { z } from "zod"
import { jobIdFromUrl, safeJobUrl } from "../core/urls"
import { searchPlatforms, type SearchJob } from "./model"

export const searchBookmarkPrefix = "todaystart.job-search.bookmark:"
export const searchBookmarksChanged = "todaystart:search-bookmarks-changed"
const generationKey = "todaystart.job-search.bookmark-generation"
const label = z.string().trim().min(1).max(300)
const bookmarkSchema = z.object({
  version: z.literal(1), generation: z.string(), savedAt: z.number().finite().nonnegative(),
  job: z.object({
    id: z.string(), platform: z.enum(searchPlatforms), companyName: label, jobTitle: label, jobUrl: z.string().max(3000),
    location: label.optional(), career: label.optional(), deadline: label.optional()
  }).strict()
}).strict()
export type SearchBookmark = z.infer<typeof bookmarkSchema>
function keys(storage: Storage) { return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => !!key && key.startsWith(searchBookmarkPrefix)) }
function validated(value: unknown): SearchBookmark {
  const bookmark = bookmarkSchema.parse(value), job = bookmark.job
  const jobUrl = safeJobUrl(job.jobUrl, job.platform), id = jobIdFromUrl(jobUrl)
  if (!jobUrl || !id || !/^\d+$/.test(id) || job.id !== `${job.platform}:${id}`) throw new Error("저장할 공고 주소를 확인해 주세요.")
  const path = new URL(jobUrl).pathname
  if (!(job.platform === "saramin" ? /^\/zf_user\/jobs\/relay\/(?:pop-)?view\/?$/i : job.platform === "jobkorea" ? /^\/recruit\/gi_read\/\d+\/?$/i : job.platform === "remember" ? /^\/job\/posting\/\d+\/?$/ : /^\/wd\/\d+\/?$/).test(path)) throw new Error("저장할 공고 주소를 확인해 주세요.")
  return { ...bookmark, job: { ...job, jobUrl } }
}
function changed() { window.dispatchEvent(new Event(searchBookmarksChanged)) }

// Follow the workspace generation, so a reset cannot be undone by an old tab.
export function syncSearchBookmarkGeneration(generation?: string, storage: Storage = window.localStorage) {
  const next = generation || "initial"
  if (storage.getItem(generationKey) === next) return
  for (const key of keys(storage)) storage.removeItem(key)
  storage.setItem(generationKey, next)
  changed()
}
export function readSearchBookmarks(generation?: string, storage?: Storage): SearchBookmark[] {
  try {
    const target = storage ?? window.localStorage, current = generation || "initial"
    if (target.getItem(generationKey) !== current) return []
    return keys(target).flatMap(key => {
      try {
        const bookmark = validated(JSON.parse(target.getItem(key)!))
        return bookmark.generation === current && key === searchBookmarkPrefix + bookmark.job.id ? [bookmark] : []
      } catch { return [] }
    }).sort((a, b) => b.savedAt - a.savedAt || a.job.id.localeCompare(b.job.id))
  } catch { return [] }
}
export function setSearchBookmark(job: SearchJob, saved: boolean, generation?: string, storage: Storage = window.localStorage) {
  const current = generation || "initial"
  if (storage.getItem(generationKey) !== current) throw new Error("데이터가 초기화됐어요. 검색 화면을 다시 열어 주세요.")
  const bookmark = validated({ version: 1, generation: current, savedAt: Date.now(), job })
  const key = searchBookmarkPrefix + bookmark.job.id
  // One key per posting: saving in another tab does not overwrite this list.
  if (saved) storage.setItem(key, JSON.stringify(bookmark))
  else storage.removeItem(key)
  changed()
}
