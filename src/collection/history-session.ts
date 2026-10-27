import type { CollectionResult, SyncReport } from "../core/model"
import type { HistoryRun } from "./history-run-model"
import type { CollectionIndicatorState } from "../ui/collection-indicator"

// Full-run failures keep their retry action until an explicit current-page import.
export class HistorySession {
  manualPending = false
  resetPaused = false
  singleState: CollectionIndicatorState | undefined
  singleAt = 0
  singleId = crypto.randomUUID()
  lastHistoryFingerprint = ""

  shouldRetryRun(run?: HistoryRun) {
    return run?.status === "error" && (this.singleState?.id === run.id || Date.parse(run.startedAt) >= this.singleAt)
  }
  activeRun(run?: HistoryRun) {
    return run && (run.status === "running" || Date.parse(run.startedAt) >= this.singleAt) ? run : undefined
  }
  resetWindow() {
    this.resetPaused = false
    this.lastHistoryFingerprint = ""
    this.manualPending = false
    this.singleId = crypto.randomUUID()
    this.singleState = undefined
  }
  dataReset() {
    this.resetPaused = true
    this.manualPending = false
    this.singleState = undefined
  }
  routeChanged() {
    this.lastHistoryFingerprint = ""
    this.manualPending = false
    this.singleState = undefined
  }
  begin(automatic: boolean, result: CollectionResult, inBatch: boolean) {
    if (!inBatch) {
      // Only an explicit page import may replace the whole-history run's UI.
      // Login-triggered auto-sync must preserve that run's full retry action.
      if (!automatic) this.singleAt = Date.now()
      this.singleState = { id: this.singleId, status: "running", title: result.code === "loading" ? "지원 목록 불러오는 중" : "현재 목록 가져오는 중", message: result.code === "loading" ? result.message : "화면의 지원 기록을 이 브라우저에 저장하고 있습니다." }
    }
    if (!automatic && result.code === "loading") this.manualPending = true
  }
  complete(report: SyncReport, inBatch: boolean) {
    if (report.code !== "loading") this.manualPending = false
    if (!inBatch && report.code !== "loading") {
      const success = ["ok", "partial", "empty"].includes(report.code)
      this.singleState = { id: this.singleId, status: success ? report.skipped ? "stopped" : "completed" : "error", title: success ? report.skipped ? "현재 목록 일부 수집" : "현재 목록 수집 완료" : "지원 목록 확인 필요", message: success ? `${report.collected}건 읽음 · ${report.inserted}건 추가 · ${report.updated}건 갱신${report.skipped ? ` · ${report.skipped}건 확인 필요` : ""}` : report.message, detail: success ? "현재 화면에서 읽힌 기록을 저장했습니다. 전체 페이지는 팝업에서 가져올 수 있습니다." : undefined, retryable: !success || report.skipped > 0 }
    }
  }
}
