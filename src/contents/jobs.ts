import type { PlasmoCSConfig } from "plasmo"
import { platformLabel, type ApplicationRecord, type CollectionResult, type PageState, type SyncReport } from "../core/model"
import { platformForUrl } from "../core/urls"
import { PostingMatches } from "../core/posting-matches"
import { PostingView } from "../platforms/posting-view"
import { DomPlatformAdapter } from "../platforms/adapter"
import { parseRecord } from "../platforms/parser"
import { rpc } from "../messaging/protocol"
import { WarningInjector } from "../ui/warnings"
import type { Settings } from "../storage/settings"
import { historyObservationRoot, isBuiltInHistoryUrl } from "../platforms/history"
import { historyDiagnostics } from "../platforms/history-diagnostics"
import { historyContextUrl, historyNavigationUrl, historyPagination } from "../platforms/history-pagination"
import type { HistoryRun, HistoryRunPage } from "../collection/history-run-model"
import { HistoryReadiness } from "../collection/history-readiness"
import { collectionPolicy } from "../collection/policy"
import { CollectionIndicator, type CollectionIndicatorState } from "../ui/collection-indicator"
import { WantedHistoryReader } from "../platforms/wanted-history"

export const config: PlasmoCSConfig = {
  matches: ["https://www.saramin.co.kr/*", "https://www.jobkorea.co.kr/*", "https://www.wanted.co.kr/*", "https://profile.rememberapp.co.kr/*", "https://career.rememberapp.co.kr/*"],
  run_at: "document_idle", all_frames: false
}

type Snapshot = { records: ApplicationRecord[]; settings: Settings; historyRun?: HistoryRun; dataGeneration?: string }
const platform = platformForUrl(location.href)!
let snapshot: Snapshot | undefined
let adapter = new DomPlatformAdapter(platform)
const injector = new WarningInjector()
const postingMatches = new PostingMatches()
const postingView = new PostingView()
let state: PageState = { platform, kind: "other", matches: 0, message: "페이지를 확인하고 있습니다." }
let observer: MutationObserver | undefined
let discovery: MutationObserver | undefined
let observedRoot: Element | undefined
let rootLifecycle: MutationObserver | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let lastHistoryFingerprint = ""
let lastSuccessFingerprint = ""
let running = false
let rerun = false
const readiness = new HistoryReadiness()
const wantedHistory = new WantedHistoryReader()
let historyUrl = ""
let readinessTimer: ReturnType<typeof setTimeout> | undefined
let discoveryTimer: ReturnType<typeof setTimeout> | undefined
let manualPending = false
let resetPaused = false
let singleState: CollectionIndicatorState | undefined
let singleAt = 0
let singleId = crypto.randomUUID()
const collectionIndicator = new CollectionIndicator({
  dashboard: () => { void rpc({ type: "open_dashboard" }).catch(() => undefined) },
  stop: () => { void rpc({ type: "history_run", operation: "stop" }).catch(() => undefined) },
  retry: () => { void retryCollection() }
})

async function retryCollection() {
  const run = snapshot?.historyRun
  const retryRun = run?.status === "error" && (singleState?.id === run.id || Date.parse(run.startedAt) >= singleAt)
  resetHistoryWindow()
  try {
    if (retryRun) {
      await rpc({ type: "history_run", operation: "retry" })
      await refreshSnapshot()
    } else {
      manualPending = true
      await sync(false)
    }
    schedule()
  } catch (error) {
    manualPending = false
    singleAt = Date.now()
    singleState = { id: retryRun ? run.id : singleId, status: "error", title: "지원 기록 재시도 확인 필요", message: error instanceof Error ? error.message : "가져오기를 다시 시작하지 못했습니다.", retryable: true }
    renderCollectionIndicator()
  }
}

function beginDiscovery(duration: number) {
  discovery?.observe(document.documentElement, { childList: true, subtree: true })
  if (discoveryTimer) clearTimeout(discoveryTimer)
  discoveryTimer = setTimeout(() => discovery?.disconnect(), duration)
}
function resetHistoryWindow() {
  resetPaused = false
  historyUrl = location.href; readiness.reset(historyUrl); lastHistoryFingerprint = ""
  manualPending = false
  singleId = crypto.randomUUID(); singleState = undefined
  if (readinessTimer) clearTimeout(readinessTimer)
  readinessTimer = setTimeout(() => void refresh(), collectionPolicy.historyReadyTimeoutMs + 10)
  beginDiscovery(collectionPolicy.historyReadyTimeoutMs)
}
async function collectHistory(explicit = false): Promise<CollectionResult> {
  if (historyUrl !== location.href) resetHistoryWindow()
  const url = location.href
  let result = adapter.collect(document)
  if (platform === "wanted" && !adapter.profile && snapshot?.settings.consent.wanted && (explicit || snapshot.settings.autoRecord || manualPending || snapshot.historyRun?.status === "running")) {
    const ids = JSON.stringify(result.records.map(record => record.id))
    result = await wantedHistory.read(document, result)
    const current = adapter.collect(document)
    if (JSON.stringify(current.records.map(record => record.id)) !== ids) result = current
  }
  if (location.href !== url) result = adapter.collect(document)
  if (!isBuiltInHistoryUrl(location.href, platform)) return result
  const root = historyObservationRoot(document)
  const busy = root?.matches('[aria-busy="true"]') || !!root?.querySelector('[aria-busy="true"],[role="progressbar"]:not([aria-valuenow])')
  return readiness.review(result, location.href, busy)
}
function renderCollectionIndicator() {
  if (!snapshot || pageKind() !== "history") { collectionIndicator.clear(); return }
  const run = snapshot.historyRun
  if (run && (run.status === "running" || Date.parse(run.startedAt) >= singleAt)) {
    collectionIndicator.render({
      id: run.id, status: run.status,
      title: `${platformLabel[platform]} ${run.status === "running" ? "지원 기록 가져오는 중" : run.status === "completed" ? "지원 기록 수집 완료" : run.status === "stopped" ? "지원 기록 수집 중지" : "지원 기록 확인 필요"}`,
      message: run.message, detail: `${run.pages}페이지 · ${run.processed}건 읽음 · ${run.inserted}건 추가 · ${run.updated}건 갱신${run.skipped ? ` · ${run.skipped}건 확인 필요` : ""}`,
      stoppable: run.status === "running", retryable: run.status === "error"
    }, snapshot.settings.theme)
  } else collectionIndicator.render(singleState, snapshot.settings.theme)
}

function pageKind(): PageState["kind"] {
  if (adapter.isApplicationHistoryPage(location.href)) return "history"
  if (adapter.isJobDetailPage(location.href)) return "detail"
  if (adapter.isJobListingPage(location.href)) return "listing"
  return "other"
}
async function refreshSnapshot() {
  const next = await rpc<Snapshot>({ type: "snapshot" })
  if (snapshot && snapshot.dataGeneration !== next.dataGeneration) {
    resetPaused = true; manualPending = false; singleState = undefined
    collectionIndicator.clear()
  }
  snapshot = next
  const profile = snapshot.settings.profiles[platform]
  adapter = new DomPlatformAdapter(platform, profile)
  renderCollectionIndicator()
}
function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void refresh(), 180)
}
function observeRoot() {
  const profile = adapter.profile
  const selector = pageKind() === "history" ? profile?.historyRoot : adapter.postingProfile(location.href, document)?.root
  const root = selector ? document.querySelector(selector) : pageKind() === "history" ? historyObservationRoot(document) : undefined
  const target = root
  if (target && target !== observedRoot) {
    observer?.disconnect()
    observedRoot = target
    observer = new MutationObserver(mutations => {
      if (mutations.every(m => (m.target instanceof Element && m.target.closest("todaystart-warning,todaystart-collection")) ||
        (m.type === "childList" && [...m.addedNodes, ...m.removedNodes].every(n => n instanceof Element && (n.tagName === "TODAYSTART-WARNING" || n.hasAttribute("data-todaystart-owned")))))) {
        // React can remove our sibling while keeping the posting intact. Own
        // completed renders are ignored, but a detached warning needs repair.
        if (!injector.needsRepair()) return
      }
      schedule()
    })
    observer.observe(target, { childList: true, subtree: true, characterData: true, attributes: true })
    rootLifecycle?.disconnect()
    if (target.parentElement) {
      rootLifecycle = new MutationObserver(schedule)
      rootLifecycle.observe(target.parentElement, { childList: true })
    }
  }
  if (target && state.collectionCode !== "loading") discovery?.disconnect()
}
async function sync(automatic: boolean, result?: CollectionResult, runId?: string): Promise<SyncReport> {
  const dataGeneration = snapshot?.dataGeneration
  if (!automatic) resetPaused = false
  result ||= await collectHistory(!automatic)
  const inBatch = snapshot?.historyRun?.status === "running"
  if (!inBatch) {
    // Only an explicit page import may replace the whole-history run's UI.
    // Login-triggered auto-sync must preserve that run's full retry action.
    if (!automatic) singleAt = Date.now()
    singleState = { id: singleId, status: "running", title: result.code === "loading" ? "지원 목록 불러오는 중" : "현재 목록 가져오는 중", message: result.code === "loading" ? result.message : "화면의 지원 기록을 이 브라우저에 저장하고 있습니다." }
    renderCollectionIndicator()
  }
  if (!automatic && result.code === "loading") manualPending = true
  let report: SyncReport
  try { report = await rpc<SyncReport>({ type: "collect", platform, result, automatic, dataGeneration, runId }) }
  catch (error) {
    manualPending = false
    singleState = { id: singleId, status: "error", title: "지원 기록 저장 확인 필요", message: error instanceof Error ? error.message : "저장하지 못했습니다. 다시 시도해 주세요.", retryable: true }
    renderCollectionIndicator()
    throw error
  }
  state.lastReport = report
  state.collectionCode = report.code
  state.message = report.message
  state.hasNextPage = report.hasNextPage
  if (report.code !== "loading") manualPending = false
  if (!inBatch && report.code !== "loading") {
    const success = ["ok", "partial", "empty"].includes(report.code)
    singleState = { id: singleId, status: success ? report.skipped ? "stopped" : "completed" : "error", title: success ? report.skipped ? "현재 목록 일부 수집" : "현재 목록 수집 완료" : "지원 목록 확인 필요", message: success ? `${report.collected}건 읽음 · ${report.inserted}건 추가 · ${report.updated}건 갱신${report.skipped ? ` · ${report.skipped}건 확인 필요` : ""}` : report.message, detail: success ? "현재 화면에서 읽힌 기록을 저장했습니다. 전체 페이지는 팝업에서 가져올 수 있습니다." : undefined, retryable: !success || report.skipped > 0 }
    renderCollectionIndicator()
  }
  return report
}
async function refresh() {
  if (running) { rerun = true; return }
  running = true
  try {
    if (!snapshot) await refreshSnapshot()
    const settings = snapshot!.settings
    injector.setTheme(settings.theme)
    const kind = pageKind()
    const postingProfile = adapter.postingProfile(location.href, document)
    state = { ...state, platform, kind, collectionCode: undefined, profileReady: kind === "history" ? !!adapter.profile || isBuiltInHistoryUrl(location.href, platform) : !!postingProfile, matches: 0,
      message: "사이트 화면 검증이 필요합니다. 설정에서 선택자 파일을 등록해 주세요." }
    if (adapter.profile) state.message = kind === "history" ? "현재 화면의 지원 내역을 가져올 수 있습니다." : "현재 화면을 확인했습니다. 저장된 이력이 없으면 중복 여부를 판단할 수 없습니다."
    if ((kind === "listing" || kind === "detail") && postingProfile) {
      const postings = adapter.extractJobPostings(document)
      postingMatches.update(snapshot!.records, settings.showCancelled)
      const found = new Map(postings.map(posting => [posting, postingMatches.find(posting, settings.similarWarnings)]))
      state.matches = postings.filter(posting => found.get(posting)!.length > 0).length
      const showWarnings = kind === "detail" ? settings.detailWarnings : settings.listingWarnings
      if (showWarnings) {
        const changed = postingView.changed(postings, snapshot!.records, JSON.stringify([kind, settings.theme, settings.showCancelled, settings.similarWarnings]))
        if (changed || injector.needsRepair()) injector.render(postings, posting => found.get(posting) || [], kind === "detail")
      } else { injector.clear(); postingView.clear() }
      state.message = postings.length ? `${postings.length}개 공고를 확인했습니다.${state.matches ? ` ${state.matches}개 공고에 저장된 지원 이력이 있습니다.` : " 저장된 지원 이력과 일치하는 기업을 찾지 못했습니다. 미수집 이력은 확인할 수 없습니다."}` : "공고 영역을 인식하지 못했습니다. 로딩 완료 후 다시 확인하거나 사이트 화면 변경을 확인해 주세요."
    } else { injector.clear(); postingView.clear() }
    if (kind === "history") {
      const result = await collectHistory()
      state.collectionCode = result.code
      state.message = result.message
      state.hasNextPage = result.hasNextPage
      const fingerprint = JSON.stringify([result.code, result.scope, result.skipped, result.records.map(({ collectedAt, lastSeenAt, lastSyncedAt, ...r }) => r)])
      if ((manualPending || (!resetPaused && settings.autoRecord && settings.historyAutoCollect)) && settings.consent[platform] && fingerprint !== lastHistoryFingerprint) {
        await sync(!manualPending, result)
        lastHistoryFingerprint = fingerprint
      }
    }
    if (settings.autoRecord && settings.consent[platform] && adapter.detectApplicationSuccess(document)) {
      const record = adapter.successRecord(document)
      const fingerprint = record && JSON.stringify([location.href, record.sourceApplicationId, record.sourceJobId, record.appliedAt, record.companyName, record.jobTitle])
      if (record && fingerprint !== lastSuccessFingerprint) {
        await rpc({ type: "observe", record })
        lastSuccessFingerprint = fingerprint!
      }
    }
    observeRoot()
    renderCollectionIndicator()
  } catch (error) { state.message = error instanceof Error ? error.message : "확장 프로그램을 다시 열어 주세요." }
  finally { running = false; if (rerun) { rerun = false; schedule() } }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab || (sender.url && !sender.url.startsWith(chrome.runtime.getURL("")))) return
  if (message?.type === "HISTORY_RUN_CHANGED") {
    void refreshSnapshot().catch(() => undefined)
    return
  }
  if (message?.type === "DATA_CHANGED") {
    void refreshSnapshot().then(schedule).catch(() => undefined)
    return
  }
  if (!["GET_PAGE", "SYNC_PAGE", "NEXT_PAGE", "FIRST_PAGE", "HISTORY_DIAGNOSTICS", "HISTORY_RUN_INSPECT"].includes(message?.type)) return
  void (async () => {
    await refreshSnapshot()
    if (message.type === "HISTORY_DIAGNOSTICS") return historyDiagnostics(document, platform)
    if (message.type === "HISTORY_RUN_INSPECT") {
      if (!isBuiltInHistoryUrl(location.href, platform)) throw new Error("지원 현황에서 실행해 주세요.")
      const result = await collectHistory(), pagination = historyPagination(document, platform)
      const signature = JSON.stringify(result.records.map(record => [record.id, record.status]).sort(([a], [b]) => a!.localeCompare(b!)))
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signature))
      const fingerprint = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("")
      return {
        url: location.href, filterUrl: historyContextUrl(document, platform), fingerprint, code: result.code, scope: result.scope,
        currentPage: pagination.currentPage, hasNextPage: pagination.hasNextPage,
        hasFirstPage: pagination.hasFirstPage, paginationFound: pagination.paginationFound, endKnown: pagination.endKnown
      } satisfies HistoryRunPage
    }
    if (message.type === "SYNC_PAGE") {
      if (pageKind() !== "history") throw new Error("로그인한 지원 현황 페이지에서 실행해 주세요.")
      if (message.runId && (snapshot?.historyRun?.id !== message.runId || snapshot?.historyRun?.status !== "running")) throw new Error("중지된 가져오기 요청입니다.")
      const report = await sync(false, undefined, message.runId)
      await refreshSnapshot()
      await refresh()
      return report
    }
    if (message.type === "NEXT_PAGE" || message.type === "FIRST_PAGE") {
      const settings = snapshot!.settings
      if (!settings.consent[platform] || pageKind() !== "history") throw new Error("지원 현황에서 자동 수집 설정을 켠 뒤 이용해 주세요.")
      const selector = message.type === "NEXT_PAGE" && adapter.profile?.nextPage
      const pagination = historyPagination(document, platform)
      const next = selector ? document.querySelector<HTMLElement>(selector) : message.type === "FIRST_PAGE" ? pagination.first : pagination.next
      if (!next || next.matches(':disabled,[disabled],[aria-disabled="true"]')) throw new Error("이동할 페이지를 찾을 수 없습니다.")
      const navigationUrl = !selector && historyNavigationUrl(platform, location.href, pagination, message.type)
      if (navigationUrl) { location.assign(navigationUrl); return true }
      next.click()
      return true
    }
    await refresh()
    return state
  })().then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error instanceof Error ? error.message : "페이지 확인 실패" }))
  return true
})

document.addEventListener("submit", event => {
  const form = event.target
  const settings = snapshot?.settings
  const profile = adapter.profile
  if (!event.isTrusted || !settings?.autoRecord || !settings.consent[platform] || !profile?.submissionForm || !(form instanceof Element) || !form.matches(profile.submissionForm)) return
  // Submission is only an attempt. Completion requires a separate success/history observation.
  const record = parseRecord(form, profile, location.href, "submission_attempt", "pending_confirmation")
  if (record) void rpc({ type: "observe", record }).catch(() => undefined)
}, true)

chrome.storage.onChanged.addListener(changes => {
  if (changes.revision || changes.settings) void refreshSnapshot().then(schedule).catch(() => undefined)
})
window.addEventListener("popstate", () => { lastHistoryFingerprint = ""; schedule() })
window.addEventListener("hashchange", schedule)
window.addEventListener("pageshow", schedule)
window.addEventListener("online", schedule)
let previousUrl = location.href
// Only compare the URL; DOM work happens once when a SPA changes routes.
setInterval(() => {
  if (!document.hidden && previousUrl !== location.href) {
    previousUrl = location.href
    lastHistoryFingerprint = ""
    manualPending = false
    singleState = undefined
    beginDiscovery(pageKind() === "history" ? collectionPolicy.historyReadyTimeoutMs : 15000)
    schedule()
  }
}, 1000)
document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule() })
// Initial root discovery is bounded; no permanent document-wide subtree observer.
discovery = new MutationObserver(schedule)
beginDiscovery(pageKind() === "history" ? collectionPolicy.historyReadyTimeoutMs : 15000)
void refresh()
