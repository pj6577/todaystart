import { jobIdFromUrl } from "../core/urls"
import { lifetime, type Handoff } from "./store"
import type { SubmissionHandlers } from "./event-context"
import type { SubmissionAttempt } from "./model"

export const jobkoreaEvents = {
  async popup_link(event, { tabId, frameId, rawUrl, adapter, publicListing }, services) {
    const state = await services.store.read()
    const detail = adapter.isJobDetailPage(rawUrl) && jobIdFromUrl(rawUrl) === event.sourceJobId
    const listingContext = publicListing && state.contexts.some(value => value.platform === "jobkorea" && value.tabId === tabId && value.context.sourceJobId === event.sourceJobId && value.context.internalGiNo === event.internalGiNo)
    if (frameId !== 0 || new URL(rawUrl).hostname !== "www.jobkorea.co.kr" || (!detail && !listingContext)) throw new Error("지원창 연결의 출처가 다릅니다.")
    const samePair = (value: Handoff) => value.tabId === tabId && value.sourceJobId === event.sourceJobId && value.internalGiNo === event.internalGiNo
    const existing = state.handoffs.find(samePair)
    // A fresh native window.open has its own launch ID. Permit an intentional
    // reopen, while replaying the same event cannot refresh/reclaim a link.
    if (!existing || (event.launchId && event.launchId !== existing.launchId)) {
      state.handoffs = state.handoffs.filter(value => !samePair(value))
      state.handoffs.push({ tabId, sourceJobId: event.sourceJobId, internalGiNo: event.internalGiNo, ...(event.launchId ? { launchId: event.launchId } : {}), observedAt: new Date().toISOString() })
    }
    state.handoffs = state.handoffs.slice(-100)
    // A launch is not an entered/submitted attempt. It only links independently
    // observed OnPass events to the detail document's public/internal pair.
    await services.attachContexts(state)
    await services.store.save(state.attempts)
    return true
  },
  async completion_marker(event, { tabId, frameId, rawUrl, page, adapter, publicListing, sender }, services) {
    const postingId = publicListing && frameId === 0 ? event.postingId : adapter.isJobDetailPage(rawUrl) ? jobIdFromUrl(rawUrl) : undefined
    if (event.postingId && event.postingId !== postingId) throw new Error("완료 공고 식별자가 다릅니다.")
    if (page?.platform !== "jobkorea" && !postingId) throw new Error("지원 완료 표시의 출처를 확인해 주세요.")
    if (/\/onpassresult\/?$/i.test(new URL(rawUrl).pathname) && !page?.postingId) return false
    const { attempts } = await services.store.read()
    const observed = attempts.filter(attempt => attempt.platform === "jobkorea" && (attempt.requestId || attempt.clickedAt) && Date.now() - Date.parse(attempt.startedAt) < lifetime)
    let candidates = observed.filter(attempt =>
      (postingId ? frameId === 0 && attempt.context?.sourceJobId === postingId && (attempt.tabId === tabId || attempt.openerTabId === tabId || attempt.contextTabId === tabId)
        : attempt.tabId === tabId && attempt.frameId === frameId && (!page?.jobId || page.jobId === attempt.sourceJobId) && (!page?.postingId || page.postingId === attempt.context?.sourceJobId)))
    async function issue(values: SubmissionAttempt[], code: NonNullable<SubmissionAttempt["completionIssue"]>) {
      const changed = values.filter(attempt => attempt.stage !== "confirmed" && attempt.completionIssue !== code)
      if (!changed.length) return
      for (const attempt of changed) attempt.completionIssue = code
      await services.store.save(attempts)
    }
    // A result document belongs to its own request even when an older retry
    // for the same posting is still in local history.
    const exact = sender.documentId ? candidates.filter(attempt => attempt.documentId === sender.documentId || attempt.resultDocumentId === sender.documentId) : []
    if (exact.length) candidates = exact
    let pending = candidates.filter(attempt => attempt.stage !== "confirmed")
    if (pending.length > 1) {
      const closedAt = (attempt: SubmissionAttempt) => attempt.closedAt || (attempt.reason === "closed" ? attempt.updatedAt : undefined)
      const open = pending.filter(attempt => !closedAt(attempt))
      // Only discard an old window if it was already closed before this
      // submission began. Two concurrent submissions remain ambiguous.
      if (open.length === 1 && pending.every(attempt => attempt.id === open[0]!.id || !!closedAt(attempt) && Date.parse(closedAt(attempt)!) <= Date.parse(open[0]!.startedAt))) pending = open
    }
    if (pending.length !== 1) {
      if (pending.length > 1) await issue(pending, "ambiguous_attempts")
      if (!candidates.length && page?.result) {
        const related = observed.filter(attempt => attempt.tabId === tabId && attempt.frameId === frameId && (!page.jobId || page.jobId === attempt.sourceJobId))
        await issue(related.filter(attempt => !attempt.context), "missing_context")
        if (page.postingId) await issue(related.filter(attempt => !!attempt.context && attempt.context.sourceJobId !== page.postingId), "posting_mismatch")
      }
      return pending.length === 0 && candidates.some(attempt => attempt.stage === "confirmed")
    }
    const attempt = pending[0]!
    attempt.stage = "confirmed"; attempt.reason = "success"; attempt.confirmationMethod = "completion_marker"; attempt.updatedAt = new Date().toISOString()
    delete attempt.completionIssue
    await services.materialize(attempt)
    await services.store.save(attempts)
    return true
  }
} satisfies Pick<SubmissionHandlers, "popup_link" | "completion_marker">
