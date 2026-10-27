import { ApplicationRepository } from "./storage/repository"
import { SubmissionTracker } from "./submission/tracker"
import { resumeHistoryRun } from "./collection/history-run"
import { platformHostPatterns } from "./core/platforms"
import type { HistoryRun } from "./collection/history-run-model"
import { createRequestHandler } from "./background/router"

const repository = new ApplicationRepository()
const submissions = new SubmissionTracker(repository)
const handle = createRequestHandler({ repository, submissions })
// Serialize requests and tab cleanup across all extension contexts.
let queue: Promise<unknown> = Promise.resolve()

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
