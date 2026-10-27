import { z } from "zod"
import { platformIds } from "../core/platforms"
import type { Platform } from "../core/model"
import type { HistoryRun } from "../collection/history-run-model"

export type HistoryCompletions = Partial<Record<Platform, string>>
let writes: Promise<unknown> = Promise.resolve()
async function read(): Promise<HistoryCompletions> {
  const { historyCompletions } = await chrome.storage.local.get("historyCompletions")
  const stored = historyCompletions && typeof historyCompletions === "object" ? historyCompletions as Record<string, unknown> : {}
  return Object.fromEntries(platformIds.flatMap(platform => {
    const value = z.string().datetime().safeParse(stored[platform])
    return value.success ? [[platform, value.data]] : []
  }))
}
export function rememberHistoryCompletion(platform: Platform, completedAt: string) {
  const operation = writes.then(async () => {
    const current = await read()
    if (current[platform] && current[platform]! >= completedAt) return
    await chrome.storage.local.set({ historyCompletions: { ...current, [platform]: completedAt } })
  })
  writes = operation.catch(() => undefined)
  return operation
}
export async function getHistoryCompletions(legacy?: HistoryRun) {
  // Preserve the one successful session run available during an upgrade. Older
  // overwritten runs cannot be inferred from partial record counts.
  if (legacy?.status === "completed") await rememberHistoryCompletion(legacy.platform, legacy.updatedAt)
  return read()
}
