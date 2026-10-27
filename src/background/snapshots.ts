import { getDataGeneration } from "../storage/data-generation"
import { getReports } from "../storage/settings"
import { getHistoryRun, resumeHistoryRun } from "../collection/history-run"
import { getHistoryCompletions } from "../storage/history-completions"
import type { RequestHandlers } from "./context"

export const snapshots = {
  async planner_snapshot(request, { repository }) {
    const dataGeneration = await getDataGeneration()
    return { planner: await repository.plannerSnapshot(), dataGeneration }
  },
  async snapshot(request, { repository, submissions, settings, sender, extensionPage }) {
    const historyRun = await getHistoryRun()
    if (historyRun?.status === "running") setTimeout(() => void resumeHistoryRun(), 0)
    const submissionAttempts = extensionPage ? await submissions.snapshot() : undefined
    const dataGeneration = await getDataGeneration()
    return { records: await repository.list(), settings, reports: await getReports(), dataGeneration, historyRun: extensionPage || historyRun?.tabId === sender.tab?.id ? historyRun : undefined, ...(extensionPage ? { historyCompletions: await getHistoryCompletions(historyRun), submissionAttempts, planner: await repository.plannerSnapshot() } : {}) }
  }
} satisfies Pick<RequestHandlers, "snapshot" | "planner_snapshot">
