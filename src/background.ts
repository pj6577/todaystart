import { RequestSchema } from "./messaging/protocol"
import { ApplicationRepository } from "./storage/repository"
import { getReports, getSettings, saveReport, saveSettings } from "./storage/settings"
import { syncCollection } from "./collection/sync"
import { applicationIdentity } from "./core/identity"
import { platformForUrl } from "./core/urls"
import { isBuiltInHistoryUrl } from "./platforms/history"
import { getHistoryRun, resumeHistoryRun, startHistoryRun, stopHistoryRun } from "./collection/history-run"
import { platformHostPatterns } from "./core/platforms"
import type { HistoryRun } from "./collection/history-run-model"
import { getHistoryCompletions } from "./storage/history-completions"
import { SubmissionTracker } from "./submission/tracker"
import { applicationPage } from "./submission/model"

const repository = new ApplicationRepository()
const submissions = new SubmissionTracker(repository)
// Serialize mutations across popup, options, and simultaneous platform tabs.
let queue: Promise<unknown> = Promise.resolve()
async function handle(raw: unknown, sender: chrome.runtime.MessageSender) {
  if (sender.id !== chrome.runtime.id) throw new Error("허용되지 않은 요청입니다.")
  const request = RequestSchema.parse(raw)
  const extensionPage = sender.url?.startsWith(chrome.runtime.getURL("")) === true
  const platform = sender.url ? platformForUrl(sender.url) : undefined
  if (request.type === "submission_policy") {
    if (extensionPage || !platform) throw new Error("지원 사이트에서만 확인할 수 있습니다.")
    const settings = await getSettings()
    return { enabled: settings.autoRecord && settings.consent[platform] }
  }
  if (request.type === "submission") {
    if (extensionPage || !platform || request.event.platform !== platform) throw new Error("지원 사이트에서만 관찰할 수 있습니다.")
    const settings = await getSettings()
    if (!settings.autoRecord || !settings.consent[platform]) return false
    if (request.event.platform === "wanted" && ["context", "entered", "apply_clicked", "wanted_submit", "wanted_completed"].includes(request.event.kind)) {
      if (sender.frameId !== 0 || !sender.tab?.id) return false
      // A SPA's content-script sender can retain the document's original URL.
      // Verify the browser's current tab URL instead of trusting a page string.
      const tab = await chrome.tabs.get(sender.tab.id)
      const page = tab.url && applicationPage(tab.url)
      const event = request.event
      const jobId = event.kind === "context" || event.kind === "wanted_submit" ? event.context.sourceJobId : "sourceJobId" in event ? event.sourceJobId : undefined
      if (!page || page.platform !== "wanted" || page.jobId !== jobId) return false
      // The click can already have navigated by the time the worker dequeues
      // it. Validate the live tab's same job, then persist the observed click
      // with its canonical posting URL. Completion still requires /applied.
      return submissions.observe(event, { ...sender, url: event.kind === "wanted_completed" ? tab.url : `https://www.wanted.co.kr/wd/${jobId}` })
    }
    return submissions.observe(request.event, sender)
  }
  if (!extensionPage && (!platform || sender.frameId !== 0)) throw new Error("지원 사이트의 최상위 화면에서만 접근할 수 있습니다.")
  if (!extensionPage && !["snapshot", "collect", "observe", "open_dashboard", "history_run"].includes(request.type)) throw new Error("기록 관리는 확장 프로그램 화면에서만 가능합니다.")
  const settings = await getSettings()
  switch (request.type) {
    case "planner_snapshot": {
      const { dataGeneration } = await chrome.storage.local.get("dataGeneration")
      return { planner: await repository.plannerSnapshot(), dataGeneration }
    }
    case "snapshot": {
      const historyRun = await getHistoryRun()
      if (historyRun?.status === "running") setTimeout(() => void resumeHistoryRun(), 0)
      const submissionAttempts = extensionPage ? await submissions.snapshot() : undefined
      const { dataGeneration } = await chrome.storage.local.get("dataGeneration")
      return { records: await repository.list(), settings, reports: await getReports(), dataGeneration, historyRun: extensionPage || historyRun?.tabId === sender.tab?.id ? historyRun : undefined, ...(extensionPage ? { historyCompletions: await getHistoryCompletions(historyRun), submissionAttempts, planner: await repository.plannerSnapshot() } : {}) }
    }
    case "open_dashboard": return chrome.tabs.create({ url: chrome.runtime.getURL("options.html") + "#overview" })
    case "history_run": {
      if (request.operation === "retry") {
        const run = await getHistoryRun()
        if (!run || run.status !== "error" || (!extensionPage && run.tabId !== sender.tab?.id) || (request.tabId !== undefined && request.tabId !== run.tabId)) throw new Error("이 탭에서 실패한 가져오기만 다시 시작할 수 있습니다.")
        return startHistoryRun(run.tabId)
      }
      if (!extensionPage && (request.operation !== "stop" || (await getHistoryRun())?.tabId !== sender.tab?.id)) throw new Error("이 탭에서 진행 중인 수집만 중지할 수 있습니다.")
      if (request.operation === "stop") return stopHistoryRun()
      if (!request.tabId) throw new Error("지원 현황 탭을 확인해 주세요.")
      return startHistoryRun(request.tabId)
    }
    case "settings": return saveSettings(request.settings)
    case "manual_create": {
      const record = await repository.createManual(request.application)
      await chrome.storage.local.set({ revision: crypto.randomUUID() })
      return record
    }
    case "collect": {
      if (extensionPage || platform !== request.platform) throw new Error("현재 사이트와 수집 플랫폼이 다릅니다.")
      const { dataGeneration } = await chrome.storage.local.get("dataGeneration")
      if (request.dataGeneration !== dataGeneration) throw new Error("지원 기록이 초기화되었습니다. 다시 가져오기를 시작해 주세요.")
      if (request.runId) {
        const run = await getHistoryRun()
        if (run?.id !== request.runId || run.status !== "running" || run.tabId !== sender.tab?.id) throw new Error("중지된 가져오기 요청입니다.")
      }
      if (!settings.consent[platform] || (request.automatic && !settings.autoRecord)) throw new Error("자동 수집이 꺼져 있습니다. 설정에서 켜 주세요.")
      if (!settings.profiles[platform] && !isBuiltInHistoryUrl(sender.url!, platform)) throw new Error("지원 현황 페이지에서 실행해 주세요.")
      if (request.result.records.some(r => r.platform !== platform || r.evidence !== "history_page")) throw new Error("수집 기록의 출처가 올바르지 않습니다.")
      request.result.records = request.result.records.map(r => ({ ...r, id: applicationIdentity(r) }))
      const report = await syncCollection(repository, platform, request.result)
      await submissions.reconcile()
      await saveReport(report)
      if (report.collected) await chrome.storage.local.set({ revision: crypto.randomUUID() })
      return report
    }
    case "observe": {
      const record = request.record
      if (extensionPage || record.platform !== platform || !settings.consent[platform] || !settings.autoRecord || !settings.profiles[platform]) throw new Error("자동 기록 권한을 확인해 주세요.")
      if (!((record.evidence === "success_page" && record.status === "applied") || (record.evidence === "submission_attempt" && record.status === "pending_confirmation"))) throw new Error("신규 지원의 근거를 확인해 주세요.")
      record.id = applicationIdentity(record)
      if (record.status === "pending_confirmation" && !record.sourceJobId && !record.jobUrl) throw new Error("확인 대기 기록을 식별할 공고 정보가 없습니다.")
      const result = await repository.merge([record])
      await submissions.reconcile()
      await chrome.storage.local.set({ revision: crypto.randomUUID() })
      return result
    }
    case "edit": {
      const record = await repository.edit(request.id, request.changes)
      await submissions.reconcile()
      await chrome.storage.local.set({ revision: crypto.randomUUID() })
      return record
    }
    case "remove": {
      await repository.delete(request.id, request.linked)
      await chrome.storage.local.set({ revision: crypto.randomUUID() })
      return true
    }
    case "note_save":
    case "note_layout":
    case "event_save":
    case "planner_remove": {
      const { dataGeneration } = await chrome.storage.local.get("dataGeneration")
      if (request.dataGeneration !== dataGeneration) throw new Error("데이터가 초기화되었어요. 작성 내용을 복사한 뒤 새로 열어 주세요.")
      const result = request.type === "note_layout" ? await repository.changeNoteLayout(request.change) : request.type === "note_save" ? await repository.saveNote(request.note) : request.type === "event_save" ? await repository.saveEvent(request.event) : await repository.deletePlanner(request.kind, request.id, request.revision)
      // Planner changes refresh extension UIs without invalidating the company
      // indexes in every recruiting tab. Record changes still use revision.
      await chrome.storage.local.set({ plannerRevision: crypto.randomUUID() })
      return result
    }
    case "reset_data": {
      await stopHistoryRun()
      await repository.clear()
      await chrome.storage.session.remove("historyRun")
      await chrome.storage.local.remove(["dismissedHistoryRun", "dismissedSubmissionAttempts"])
      await chrome.storage.local.set({ reports: {}, historyCompletions: {}, submissionAttempts: [], submissionContexts: [], submissionHandoffs: [], dataGeneration: crypto.randomUUID(), revision: crypto.randomUUID() })
      return true
    }
    case "backup": return repository.backup()
    case "restore": {
      const result = await repository.restore(request.backup)
      await chrome.storage.local.set({ revision: crypto.randomUUID() })
      return result
    }
  }
}

chrome.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
  const operation = queue.then(() => handle(raw, sender))
  queue = operation.catch(() => undefined)
  operation.then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." }))
  return true
})

chrome.runtime.onInstalled.addListener(() => {
  // Keep settings and application data across extension updates.
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
})

chrome.storage.onChanged.addListener(changes => {
  if (changes.historyRun) {
    const run = changes.historyRun.newValue as HistoryRun | undefined
    if (run?.tabId) void chrome.tabs.sendMessage(run.tabId, { type: "HISTORY_RUN_CHANGED" }).catch(() => undefined)
  }
  if (!changes.revision && !changes.settings) return
  // Content scripts cannot read storage.local (TRUSTED_CONTEXTS); send an invalidation only.
  void chrome.tabs.query({ url: platformHostPatterns }).then(tabs => {
    for (const tab of tabs) if (tab.id) void chrome.tabs.sendMessage(tab.id, { type: "DATA_CHANGED" }).catch(() => undefined)
  })
})

// Session state survives a worker restart and is cleared when the browser closes.
void resumeHistoryRun().catch(() => undefined)

chrome.tabs.onRemoved.addListener(tabId => {
  const operation = queue.then(() => submissions.closeTab(tabId))
  queue = operation.catch(() => undefined)
})
