import type { SubmissionAttempt } from "./model"
import { handoffLifetime, type Handoff, type SubmissionState } from "./store"

export async function attachSubmissionContexts(state: SubmissionState, materialize: (attempt: SubmissionAttempt) => Promise<void>) {
  for (const attempt of state.attempts) {
    if (attempt.context) continue
    const exact = state.handoffs.filter(link => link.internalGiNo === attempt.sourceJobId)
    let link: Handoff | undefined
    if (attempt.platform === "jobkorea" && Date.now() - Date.parse(attempt.startedAt) < handoffLifetime) {
      // Prefer an actual tab relationship. Without Chrome's opener, require
      // one explicit recent launch, and never give its claim to another tab.
      const related = exact.filter(value => value.tabId === attempt.tabId || attempt.frameId === 0 && (value.tabId === attempt.openerTabId || value.targetTabId === attempt.tabId))
      const candidates = related.length ? related : attempt.frameId === 0 && attempt.openerTabId === undefined ? exact : []
      if (candidates.length === 1) {
        const candidate = candidates[0]!
        const competitors = state.attempts.filter(value => value.platform === "jobkorea" && value.frameId === 0 && value.sourceJobId === candidate.internalGiNo && value.tabId !== attempt.tabId && !value.context && value.openerTabId === undefined && Date.now() - Date.parse(value.startedAt) < handoffLifetime)
        if ((candidate.targetTabId === undefined || candidate.targetTabId === attempt.tabId) && (candidate.targetFrameId === undefined || candidate.targetFrameId === attempt.frameId) && (related.length || !competitors.length)) {
          link = candidate; link.targetTabId = attempt.tabId; link.targetFrameId = attempt.frameId
        }
      }
    }
    const metadata = state.contexts.filter(value => value.platform === attempt.platform && (link
      ? value.tabId === link.tabId && value.context.sourceJobId === link.sourceJobId && (!value.context.internalGiNo || value.context.internalGiNo === link.internalGiNo)
      : (value.tabId === attempt.tabId || value.tabId === attempt.openerTabId) && (value.context.internalGiNo || value.context.sourceJobId) === attempt.sourceJobId && (!exact.length || attempt.platform !== "jobkorea" || value.tabId === attempt.tabId)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    if (metadata) {
      attempt.context = link ? { ...metadata.context, internalGiNo: link.internalGiNo } : metadata.context
      // Persist the verified posting tab, including noopener launches. The
      // user may spend longer in the form than the short launch cache TTL.
      attempt.contextTabId = link?.tabId ?? metadata.tabId
      await materialize(attempt)
    }
  }
  await chrome.storage.local.set({ submissionHandoffs: state.handoffs.slice(-100) })
}
