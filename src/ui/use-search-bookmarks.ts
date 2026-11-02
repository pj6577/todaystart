import { useEffect, useState } from "react"
import type { SearchJob } from "../search/model"
import { readSearchBookmarks, searchBookmarksChanged, setSearchBookmark } from "../search/bookmarks"

export function useSearchBookmarks(generation?: string) {
  const [bookmarks, setBookmarks] = useState(() => readSearchBookmarks(generation))
  const [error, setError] = useState("")
  useEffect(() => {
    const refresh = () => setBookmarks(readSearchBookmarks(generation))
    const stored = (event: StorageEvent) => { if (event.key === null || event.key.startsWith("todaystart.job-search.bookmark")) refresh() }
    window.addEventListener(searchBookmarksChanged, refresh)
    window.addEventListener("storage", stored)
    refresh(); setError("")
    return () => { window.removeEventListener(searchBookmarksChanged, refresh); window.removeEventListener("storage", stored) }
  }, [generation])
  function toggle(job: SearchJob) {
    if (generation === undefined) return
    try {
      setSearchBookmark(job, !bookmarks.some(bookmark => bookmark.job.id === job.id), generation)
      setError("")
    } catch { setError("북마크를 변경하지 못했어요. 저장 공간과 데이터 초기화 여부를 확인한 뒤 다시 시도해 주세요.") }
  }
  return { bookmarks, toggle, error, ready: generation !== undefined }
}
