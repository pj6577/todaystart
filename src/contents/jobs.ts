import type { PlasmoCSConfig } from "plasmo"
import { platformLabel, type CollectionResult, type PageState, type SyncReport } from "../core/model"
import { platformForUrl } from "../core/urls"
import { PostingWarnings } from "../platforms/posting-warnings"
import { PageLifecycle } from "../platforms/page-lifecycle"
import { DomPlatformAdapter } from "../platforms/adapter"
import { parseRecord } from "../platforms/parser"
import { rpc } from "../messaging/protocol"
import type { Snapshot } from "../messaging/contracts"
import { historyObservationRoot, isBuiltInHistoryUrl } from "../platforms/history"
import { createPageCommandHandler } from "../collection/page-commands"
import { HistorySession } from "../collection/history-session"
import { HistoryReadiness } from "../collection/history-readiness"
import { collectionPolicy } from "../collection/policy"
import { CollectionIndicator } from "../ui/collection-indicator"
import { WantedHistoryReader } from "../platforms/wanted-history"
import { SaraminApplyLayer } from "../platforms/saramin-apply-layer"

export const config: PlasmoCSConfig = {
  matches: ["https://www.saramin.co.kr/*", "https://www.jobkorea.co.kr/*", "https://www.wanted.co.kr/*", "https://profile.rememberapp.co.kr/*", "https://career.rememberapp.co.kr/*"],
  run_at: "document_idle", all_frames: false
}

const platform = platformForUrl(location.href)!
let snapshot: Snapshot | undefined
let adapter = new DomPlatformAdapter(platform)
const warnings = new PostingWarnings()
let state: PageState = { platform, kind: "other", matches: 0, message: "페이지를 확인하고 있습니다." }
let lastSuccessFingerprint = ""
let running = false
let rerun = false
const session = new HistorySession()
const readiness = new HistoryReadiness()
const wantedHistory = new WantedHistoryReader()
let historyUrl = ""
const collectionIndicator = new CollectionIndicator({
  dashboard: () => { void rpc({ type: "open_dashboard" }).catch(() => undefined) },
  stop: () => { void rpc({ type: "history_run", operation: "stop" }).catch(() => undefined) },
  retry: () => { void retryCollection() }
})

const lifecycle = new PageLifecycle({
  refresh: () => { void refresh() },
  routeChanged: () => session.routeChanged(),
  popState: () => { session.lastHistoryFingerprint = "" },
  discoveryDuration: () => pageKind() === "history" ? collectionPolicy.historyReadyTimeoutMs : 15000,
  needsRepair: () => warnings.needsRepair()
})
const applyLayer = platform === "saramin" ? new SaraminApplyLayer(lifecycle.schedule) : undefined
applyLayer?.start()
lifecycle.addCleanup(() => applyLayer?.dispose())

const handlePageCommand = createPageCommandHandler({ platform, adapter: () => adapter, snapshot: () => snapshot, state: () => state, pageKind, sync, collectHistory, refreshSnapshot, refresh })

async function retryCollection() {
  const run = snapshot?.historyRun
  const retryRun = session.shouldRetryRun(run) ? run : undefined
  resetHistoryWindow()
  try {
    if (retryRun) {
      await rpc({ type: "history_run", operation: "retry" })
      await refreshSnapshot()
    } else {
      session.manualPending = true
      await sync(false)
    }
    lifecycle.schedule()
  } catch (error) {
    session.manualPending = false
    session.singleAt = Date.now()
    session.singleState = { id: retryRun ? retryRun.id : session.singleId, status: "error", title: "지원 기록 재시도 확인 필요", message: error instanceof Error ? error.message : "가져오기를 다시 시작하지 못했습니다.", retryable: true }
    renderCollectionIndicator()
  }
}

function resetHistoryWindow() {
  session.resetWindow()
  historyUrl = location.href; readiness.reset(historyUrl)
  lifecycle.waitForHistory(collectionPolicy.historyReadyTimeoutMs + 10)
  lifecycle.beginDiscovery(collectionPolicy.historyReadyTimeoutMs)
}
async function collectHistory(explicit = false): Promise<CollectionResult> {
  if (historyUrl !== location.href) resetHistoryWindow()
  const url = location.href
  let result = adapter.collect(document)
  if (platform === "wanted" && !adapter.profile && snapshot?.settings.consent.wanted && (explicit || snapshot.settings.autoRecord || session.manualPending || snapshot.historyRun?.status === "running")) {
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
  const run = session.activeRun(snapshot.historyRun)
  if (run) {
    collectionIndicator.render({
      id: run.id, status: run.status,
      title: `${platformLabel[platform]} ${run.status === "running" ? "지원 기록 가져오는 중" : run.status === "completed" ? "지원 기록 수집 완료" : run.status === "stopped" ? "지원 기록 수집 중지" : "지원 기록 확인 필요"}`,
      message: run.message, detail: `${run.pages}페이지 · ${run.processed}건 읽음 · ${run.inserted}건 추가 · ${run.updated}건 갱신${run.skipped ? ` · ${run.skipped}건 확인 필요` : ""}`,
      stoppable: run.status === "running", retryable: run.status === "error"
    }, snapshot.settings.theme)
  } else collectionIndicator.render(session.singleState, snapshot.settings.theme)
}

function pageKind(): PageState["kind"] {
  if (adapter.isApplicationHistoryPage(location.href)) return "history"
  if (adapter.isJobDetailPage(location.href)) return "detail"
  if (adapter.isJobListingPage(location.href)) return "listing"
  return "other"
}
async function refreshSnapshot() {
  const next = await rpc({ type: "snapshot" })
  if (snapshot && snapshot.dataGeneration !== next.dataGeneration) {
    session.dataReset()
    collectionIndicator.clear()
  }
  snapshot = next
  const profile = snapshot.settings.profiles[platform]
  adapter = new DomPlatformAdapter(platform, profile)
  renderCollectionIndicator()
}
function observeRoot() {
  const profile = adapter.profile
  const selector = pageKind() === "history" ? profile?.historyRoot : adapter.postingProfile(location.href, document)?.root
  const root = selector ? document.querySelector(selector) : pageKind() === "history" ? historyObservationRoot(document) : undefined
  lifecycle.observe(root, state.collectionCode === "loading")
}
async function sync(automatic: boolean, result?: CollectionResult, runId?: string): Promise<SyncReport> {
  const dataGeneration = snapshot?.dataGeneration
  if (!automatic) session.resetPaused = false
  result ||= await collectHistory(!automatic)
  const inBatch = snapshot?.historyRun?.status === "running"
  session.begin(automatic, result, inBatch)
  renderCollectionIndicator()
  let report: SyncReport
  try { report = await rpc({ type: "collect", platform, result, automatic, dataGeneration, runId }) }
  catch (error) {
    session.manualPending = false
    session.singleState = { id: session.singleId, status: "error", title: "지원 기록 저장 확인 필요", message: error instanceof Error ? error.message : "저장하지 못했습니다. 다시 시도해 주세요.", retryable: true }
    renderCollectionIndicator()
    throw error
  }
  state.lastReport = report
  state.collectionCode = report.code
  state.message = report.message
  state.hasNextPage = report.hasNextPage
  session.complete(report, inBatch)
  renderCollectionIndicator()
  return report
}
async function refresh() {
  if (running) { rerun = true; return }
  running = true
  try {
    if (!snapshot) await refreshSnapshot()
    const settings = snapshot!.settings
    warnings.setTheme(settings.theme)
    const kind = pageKind()
    const postingProfile = adapter.postingProfile(location.href, document)
    state = { ...state, platform, kind, collectionCode: undefined, profileReady: kind === "history" ? !!adapter.profile || isBuiltInHistoryUrl(location.href, platform) : !!postingProfile, matches: 0,
      message: "사이트 화면 검증이 필요합니다. 설정에서 선택자 파일을 등록해 주세요." }
    if (adapter.profile) state.message = kind === "history" ? "현재 화면의 지원 내역을 가져올 수 있습니다." : "현재 화면을 확인했습니다. 저장된 이력이 없으면 중복 여부를 판단할 수 없습니다."
    if ((kind === "listing" || kind === "detail") && postingProfile) {
      const result = warnings.render(adapter.extractJobPostings(document), snapshot!.records, settings, kind, applyLayer?.isOpen())
      state.matches = result.matches
      state.message = result.message
    } else if (!applyLayer?.isOpen()) warnings.clear()
    if (kind === "history") {
      const result = await collectHistory()
      state.collectionCode = result.code
      state.message = result.message
      state.hasNextPage = result.hasNextPage
      const fingerprint = JSON.stringify([result.code, result.scope, result.skipped, result.records.map(({ collectedAt, lastSeenAt, lastSyncedAt, ...r }) => r)])
      if ((session.manualPending || (!session.resetPaused && settings.autoRecord && settings.historyAutoCollect)) && settings.consent[platform] && fingerprint !== session.lastHistoryFingerprint) {
        await sync(!session.manualPending, result)
        session.lastHistoryFingerprint = fingerprint
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
  finally { running = false; if (rerun) { rerun = false; lifecycle.schedule() } }
}

const onMessage: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab || (sender.url && !sender.url.startsWith(chrome.runtime.getURL("")))) return
  if (message?.type === "HISTORY_RUN_CHANGED") {
    void refreshSnapshot().catch(() => undefined)
    return
  }
  if (message?.type === "DATA_CHANGED") {
    void refreshSnapshot().then(lifecycle.schedule).catch(() => undefined)
    return
  }
  if (!["GET_PAGE", "SYNC_PAGE", "NEXT_PAGE", "FIRST_PAGE", "HISTORY_DIAGNOSTICS", "HISTORY_RUN_INSPECT"].includes(message?.type)) return
  void handlePageCommand(message).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error instanceof Error ? error.message : "페이지 확인 실패" }))
  return true
}
chrome.runtime.onMessage.addListener(onMessage)
lifecycle.addCleanup(() => chrome.runtime.onMessage.removeListener(onMessage))


const onSubmit = (event: SubmitEvent) => {
  const form = event.target
  const settings = snapshot?.settings
  const profile = adapter.profile
  if (!event.isTrusted || !settings?.autoRecord || !settings.consent[platform] || !profile?.submissionForm || !(form instanceof Element) || !form.matches(profile.submissionForm)) return
  // Submission is only an attempt. Completion requires a separate success/history observation.
  const record = parseRecord(form, profile, location.href, "submission_attempt", "pending_confirmation")
  if (record) void rpc({ type: "observe", record }).catch(() => undefined)
}
document.addEventListener("submit", onSubmit, true)
lifecycle.addCleanup(() => document.removeEventListener("submit", onSubmit, true))

const onStorage: Parameters<typeof chrome.storage.onChanged.addListener>[0] = changes => {
  if (changes.revision || changes.settings) void refreshSnapshot().then(lifecycle.schedule).catch(() => undefined)
}
chrome.storage.onChanged.addListener(onStorage)
lifecycle.addCleanup(() => chrome.storage.onChanged.removeListener(onStorage))
lifecycle.addCleanup(() => { warnings.clear(); collectionIndicator.clear() })
lifecycle.start()
void refresh()
