import type { SyncReport } from "../core/model"
import { platformForUrl } from "../core/urls"
import type { Envelope } from "../messaging/protocol"
import { getSettings } from "../storage/settings"
import { historyFilterKey, isBuiltInHistoryUrl } from "../platforms/history-pagination"
import type { HistoryRun, HistoryRunIssue, HistoryRunPage } from "./history-run-model"
import { collectionPolicy } from "./policy"
import { getHistoryCompletions, rememberHistoryCompletion } from "../storage/history-completions"

interface StoredRun extends HistoryRun {
  filterKey: string
  resolvedFilterKey?: string
  visited: string[]
  phase: "start" | "read" | "advance"
  navigationAt?: string
}
let activeRunner: string | undefined
let writeQueue: Promise<unknown> = Promise.resolve()
class CollectionFailure extends Error {
  constructor(message: string, readonly issue: HistoryRunIssue) { super(message) }
}
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
async function filterHash(url: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(historyFilterKey(url)))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("")
}
export async function getHistoryRun(): Promise<StoredRun | undefined> {
  return (await chrome.storage.session.get("historyRun")).historyRun as StoredRun | undefined
}
function patch(id: string, changes: Partial<StoredRun>) {
  const operation = writeQueue.then(async () => {
    const current = await getHistoryRun()
    if (!current || current.id !== id || current.status !== "running") return
    const updatedAt = new Date().toISOString()
    if (changes.status === "completed") await rememberHistoryCompletion(current.platform, updatedAt)
    await chrome.storage.session.set({ historyRun: { ...current, ...changes, updatedAt } })
  })
  writeQueue = operation.catch(() => undefined)
  return operation
}
async function command<T>(tabId: number, type: string, runId?: string): Promise<T> {
  const response: Envelope<T> | undefined = await chrome.tabs.sendMessage(tabId, { type, ...(runId ? { runId } : {}) }).catch(error => { throw new CollectionFailure(String(error), "connection_lost") })
  if (!response?.ok) throw new CollectionFailure(response && !response.ok ? response.error : "지원 현황에 연결하지 못했습니다.", response ? "unknown" : "connection_lost")
  return response.data
}
class Stopped extends CollectionFailure {
  constructor(message = "", issue: HistoryRunIssue = "unknown") { super(message, issue) }
}
async function guard(id: string) {
  const run = await getHistoryRun()
  if (!run || run.id !== id || run.status !== "running") throw new Stopped()
  const tab = await chrome.tabs.get(run.tabId).catch(error => {
    const closed = /No tab|Invalid tab ID/i.test(String(error))
    throw new CollectionFailure(closed ? "지원 현황 탭이 닫혔습니다." : "지원 현황 탭에 연결하지 못했습니다.", closed ? "tab_closed" : "connection_lost")
  })
  const url = tab.pendingUrl || tab.url
  const key = url && await filterHash(url)
  if (!url || !isBuiltInHistoryUrl(url, run.platform) || key !== run.filterKey && key !== run.resolvedFilterKey) throw new CollectionFailure("조회 조건이나 탭 주소가 바뀌어 수집을 멈췄습니다. 로그인한 지원 현황에서 다시 시작해 주세요. 저장한 기록은 유지됩니다.", "context_changed")
  const settings = await getSettings()
  if (!settings.consent[run.platform]) throw new CollectionFailure("이 사이트의 수집 설정이 꺼져 중지했습니다.", "consent_disabled")
  return { run, tab }
}
async function readable(id: string, previous?: string): Promise<HistoryRunPage> {
  let message = "45초 동안 새 지원 목록을 확인하지 못해 중지했습니다. 저장한 기록은 유지됩니다."
  const deadline = Date.now() + collectionPolicy.historyReadyTimeoutMs
  let stable: string | undefined
  let issue: HistoryRunIssue = "list_unreadable"
  while (Date.now() < deadline) {
    const { run, tab } = await guard(id)
    if (tab.status !== "loading") {
      try {
        const page = await command<HistoryRunPage>(run.tabId, "HISTORY_RUN_INSPECT")
        const pageKey = await filterHash(page.url)
        if (!isBuiltInHistoryUrl(page.url, run.platform) || pageKey !== run.filterKey && pageKey !== run.resolvedFilterKey) throw new Stopped("조회 조건이 바뀌었습니다.", "context_changed")
        const contextKey = await filterHash(page.filterUrl || page.url)
        if (run.resolvedFilterKey && contextKey !== run.resolvedFilterKey) throw new Stopped("화면의 조회 조건이 바뀌어 수집을 멈췄습니다.", "context_changed")
        if (!run.resolvedFilterKey && ["ok", "partial", "empty"].includes(page.code)) await patch(id, { resolvedFilterKey: contextKey })
        if (["ok", "partial", "empty"].includes(page.code) && (!previous || page.fingerprint !== previous)) {
          const signature = JSON.stringify([page.fingerprint, page.currentPage, page.hasNextPage, page.endKnown])
          if (stable === signature) return page
          stable = signature
        } else stable = undefined
        issue = previous && ["ok", "partial", "empty"].includes(page.code) && page.fingerprint === previous ? "navigation_failed" : "list_unreadable"
        if (page.code === "login_required") throw new Stopped("로그인이 필요해 수집을 멈췄습니다.", "login_required")
        if (["selectors_unverified", "dom_changed", "loading", "error"].includes(page.code)) message = "45초 동안 지원 목록을 확인하지 못해 중지했습니다. 로딩이 끝나지 않았거나 목록 구조가 달라 읽지 못할 수 있습니다. 저장한 기록은 유지됩니다."
      } catch (error) {
        if (error instanceof Stopped) throw error
        issue = error instanceof CollectionFailure ? error.issue : "unknown"
        // A full navigation temporarily disconnects the old content script.
      }
    }
    await delay(collectionPolicy.historyPollIntervalMs)
  }
  throw new CollectionFailure(message, issue)
}
async function navigate(id: string, type: "NEXT_PAGE" | "FIRST_PAGE", fingerprint: string) {
  await patch(id, { navigationAt: new Date().toISOString(), message: type === "FIRST_PAGE" ? "조회 조건을 유지하며 첫 페이지로 이동합니다." : "다음 페이지를 불러오고 있습니다." })
  const { run } = await guard(id)
  try { await command(run.tabId, type) }
  catch (error) {
    // Some sites close the message port as the actual document navigates.
    if (!/message port|receiving end|asynchronous response|frame was removed|context invalidated/i.test(String(error))) throw new CollectionFailure(error instanceof Error ? error.message : String(error), "navigation_failed")
  }
  const page = await readable(id, fingerprint)
  await patch(id, { navigationAt: undefined })
  return page
}
export async function startHistoryRun(tabId: number): Promise<HistoryRun> {
  const existing = await getHistoryRun()
  if (existing?.status === "completed") await getHistoryCompletions(existing)
  if (existing?.status === "running") {
    if (existing.tabId === tabId) return existing
    throw new Error("다른 사이트의 수집이 진행 중입니다. 끝난 뒤 시작하거나 먼저 중지해 주세요.")
  }
  const tab = await chrome.tabs.get(tabId), url = tab.pendingUrl || tab.url, platform = url && platformForUrl(url)
  if (!platform || !url || !isBuiltInHistoryUrl(url, platform)) throw new Error("지원 사이트의 지원 현황에서 시작해 주세요.")
  if (!(await getSettings()).consent[platform]) throw new Error("이 사이트의 수집 설정을 먼저 켜 주세요.")
  const now = new Date().toISOString()
  const run: StoredRun = {
    id: crypto.randomUUID(), platform, tabId, status: "running", phase: "start", filterKey: await filterHash(url), visited: [],
    pages: 0, processed: 0, inserted: 0, updated: 0, skipped: 0,
    scope: "현재 조회 조건", message: "지원 목록이 준비되기를 기다린 뒤 첫 페이지부터 가져옵니다. 최대 45초 동안 목록을 확인합니다.", startedAt: now, updatedAt: now
  }
  await chrome.storage.session.set({ historyRun: run })
  setTimeout(() => void resumeHistoryRun(), 0)
  return run
}
export async function stopHistoryRun(): Promise<boolean> {
  const run = await getHistoryRun()
  if (run?.status === "running") await patch(run.id, { status: "stopped", issue: "user_stopped", message: `${run.pages}페이지에서 수집을 중지했습니다. 저장한 기록은 유지됩니다.` })
  return true
}
export async function resumeHistoryRun() {
  const initial = await getHistoryRun()
  if (!initial || initial.status !== "running" || activeRunner === initial.id) return
  activeRunner = initial.id
  try {
    while (true) {
      const { run } = await guard(initial.id)
      if (run.pages >= collectionPolicy.maxPagesPerRun) throw new CollectionFailure("한 번에 100페이지까지 가져왔습니다. 현재 탭에서 이어서 확인해 주세요.", "page_limit")
      let page = await readable(run.id)
      if (run.phase === "start") {
        if (page.currentPage && page.currentPage > 1) {
          if (!page.hasFirstPage) throw new CollectionFailure("첫 페이지 이동 버튼을 찾지 못했습니다. 사이트에서 1페이지를 연 뒤 다시 시작해 주세요.", "first_page_unavailable")
          page = await navigate(run.id, "FIRST_PAGE", page.fingerprint)
          if (page.currentPage !== 1) throw new CollectionFailure("첫 페이지를 확인하지 못했습니다. 사이트에서 1페이지를 연 뒤 다시 시작해 주세요.", "first_page_unavailable")
        } else if (!page.currentPage && page.paginationFound) {
          throw new CollectionFailure("현재 페이지 번호를 확인하지 못했습니다. 사이트에서 1페이지를 연 뒤 다시 시작해 주세요.", "first_page_unavailable")
        }
        await patch(run.id, { phase: "read" })
      }
      if (run.phase === "advance") {
        const previous = run.visited.at(-1)!
        if (page.fingerprint === previous) page = run.navigationAt ? await readable(run.id, previous) : await navigate(run.id, "NEXT_PAGE", previous)
        await patch(run.id, { phase: "read", navigationAt: undefined })
      }
      const { run: latest } = await guard(run.id)
      if (latest.visited.includes(page.fingerprint)) throw new CollectionFailure("이미 읽은 목록이 다시 나타나 중지했습니다. 저장한 기록은 유지됩니다.", "repeated_page")
      const report = await command<SyncReport>(run.tabId, "SYNC_PAGE", run.id)
      if (!["ok", "partial", "empty"].includes(report.code)) throw new CollectionFailure(report.message, report.code === "login_required" ? "login_required" : report.code === "error" ? "unknown" : "list_unreadable")
      const progress = {
        pages: latest.pages + 1, processed: latest.processed + report.collected,
        inserted: latest.inserted + report.inserted, updated: latest.updated + report.updated, skipped: latest.skipped + report.skipped,
        scope: report.scope, visited: [...latest.visited, page.fingerprint], phase: "advance" as const
      }
      await patch(run.id, { ...progress, message: `${progress.pages}페이지 확인 · ${progress.processed}건 처리` })
      // Inspect again after merging: auto-sync and DOM updates may have completed.
      page = await readable(run.id)
      if (!page.hasNextPage) {
        await patch(run.id, {
          status: page.endKnown && !progress.skipped ? "completed" : "stopped",
          issue: page.endKnown ? progress.skipped ? "partial" : undefined : "pagination_unknown",
          message: page.endKnown ? progress.skipped ? `${progress.pages}페이지에서 ${progress.processed}건을 읽고 ${progress.skipped}건은 읽지 못했습니다. 누락된 행 구조를 확인해야 합니다.` : `${progress.pages}페이지 수집 완료 · ${progress.processed}건 처리` : `${progress.pages}페이지를 가져왔습니다. 다음 페이지를 찾지 못해 멈췄습니다. 마지막 페이지 여부를 사이트에서 확인해 주세요.`
        })
        return
      }
      await delay(750)
    }
  } catch (error) {
    if (!(error instanceof Stopped) || error.message) await patch(initial.id, { status: "error", issue: error instanceof CollectionFailure ? error.issue : "unknown", message: error instanceof Error ? error.message : "수집을 중지했습니다." })
  } finally { if (activeRunner === initial.id) activeRunner = undefined }
}
