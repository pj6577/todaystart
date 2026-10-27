import { jobIdFromUrl } from "../core/urls"
import { lifetime, type Handoff } from "./store"
import type { SubmissionHandlers } from "./event-context"

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
  async completion_marker(event, { tabId, frameId, rawUrl, page, adapter, publicListing }, services) {
    const postingId = publicListing && frameId === 0 ? event.postingId : adapter.isJobDetailPage(rawUrl) ? jobIdFromUrl(rawUrl) : undefined
    if (event.postingId && event.postingId !== postingId) throw new Error("완료 공고 식별자가 다릅니다.")
    if (page?.platform !== "jobkorea" && !postingId) throw new Error("지원 완료 표시의 출처를 확인해 주세요.")
    if (/\/onpassresult\/?$/i.test(new URL(rawUrl).pathname) && !page?.postingId) return false
    const { attempts } = await services.store.read()
    const candidates = attempts.filter(attempt => attempt.platform === "jobkorea" && (attempt.requestId || attempt.clickedAt) && Date.now() - Date.parse(attempt.startedAt) < lifetime &&
      (postingId ? frameId === 0 && attempt.context?.sourceJobId === postingId && (attempt.tabId === tabId || attempt.openerTabId === tabId || attempt.contextTabId === tabId)
        : attempt.tabId === tabId && attempt.frameId === frameId && (!page?.jobId || page.jobId === attempt.sourceJobId) && (!page?.postingId || page.postingId === attempt.context?.sourceJobId)))
    // The result URL may omit giNo. An ambiguous result must not confirm a
    // different application, and a pre-existing button is not a new submit.
    const pending = candidates.filter(attempt => attempt.stage !== "confirmed")
    if (pending.length !== 1) return pending.length === 0 && candidates.some(attempt => attempt.stage === "confirmed")
    const attempt = pending[0]!
    attempt.stage = "confirmed"; attempt.reason = "success"; attempt.confirmationMethod = "completion_marker"; attempt.updatedAt = new Date().toISOString()
    await services.materialize(attempt)
    await services.store.save(attempts)
    return true
  }
} satisfies Pick<SubmissionHandlers, "popup_link" | "completion_marker">
