import type { CollectionResult } from "../core/model"
import { collectionPolicy } from "./policy"

// Give asynchronously rendered history a bounded discovery window. A successful
// parse or explicit login/empty state is usable immediately; time alone never
// turns an unrecognizable document into an empty application history.
export class HistoryReadiness {
  private url = ""
  private startedAt = 0
  reset(url: string, now = Date.now()) { this.url = url; this.startedAt = now }
  remaining(url: string, now = Date.now()) {
    if (url !== this.url) this.reset(url, now)
    return Math.max(0, collectionPolicy.historyReadyTimeoutMs - (now - this.startedAt))
  }
  review(result: CollectionResult, url: string, busy = false, now = Date.now()): CollectionResult {
    const remaining = this.remaining(url, now)
    if (result.code === "login_required") return result
    const unresolved = busy || ["selectors_unverified", "dom_changed", "loading"].includes(result.code)
    if (!unresolved) return result
    if (remaining > 0) return { ...result, records: [], code: "loading", message: "지원 목록을 불러오는 중입니다. 목록이 나타나면 자동으로 다시 확인합니다. 최대 45초 동안 기다립니다." }
    return { ...result, records: [], code: busy || result.code === "loading" ? "error" : result.code, message: "45초 동안 지원 목록을 확인하지 못했습니다. 로딩이 끝나지 않았거나 목록 구조가 달라 읽지 못할 수 있습니다. 다시 시도해 주세요." }
  }
}
