import { saveSettings } from "../storage/settings"
import { stopHistoryRun } from "../collection/history-run"
import type { RequestHandlers } from "./context"

export const management = {
  async open_dashboard() {
    return chrome.tabs.create({ url: chrome.runtime.getURL("options.html") + "#overview" })
  },
  async settings(request) {
    return saveSettings(request.settings)
  },
  async reset_data(request, { repository }) {
    await stopHistoryRun()
    await repository.clear()
    await chrome.storage.session.remove("historyRun")
    await chrome.storage.local.remove(["dismissedHistoryRun", "dismissedSubmissionAttempts"])
    await chrome.storage.local.set({ reports: {}, historyCompletions: {}, submissionAttempts: [], submissionContexts: [], submissionHandoffs: [], dataGeneration: crypto.randomUUID(), revision: crypto.randomUUID() })
    return true
  },
  async backup(request, { repository }) {
    return repository.backup()
  },
  async restore(request, { repository }) {
    const result = await repository.restore(request.backup)
    await chrome.storage.local.set({ revision: crypto.randomUUID() })
    return result
  }
} satisfies Pick<RequestHandlers, "open_dashboard" | "settings" | "reset_data" | "backup" | "restore">
