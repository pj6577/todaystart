import { safeJobUrl, jobIdFromUrl } from "../core/urls"
import type { SubmissionHandlers } from "./event-context"

export const contextEvents = {
  async context(event, { tabId, frameId, rawUrl, page, adapter, publicListing }, services) {
    const samePosting = adapter.isJobDetailPage(rawUrl) && jobIdFromUrl(rawUrl) === event.context.sourceJobId
    const sameApplication = page && (event.platform === "jobkorea"
      ? !page.result && page.jobId === (event.context.internalGiNo || event.context.sourceJobId)
      : page.jobId === event.context.sourceJobId)
    if (!samePosting && !sameApplication && !(publicListing && frameId === 0)) throw new Error("공고 정보의 출처가 다릅니다.")
    if (event.platform !== "jobkorea" && event.context.internalGiNo) throw new Error("지원창 식별자의 출처가 다릅니다.")
    const jobUrl = safeJobUrl(event.context.jobUrl, event.platform)
    if (!jobUrl || !adapter.isJobDetailPage(jobUrl) || jobIdFromUrl(jobUrl) !== event.context.sourceJobId) throw new Error("공고 주소를 확인해 주세요.")
    const context = { ...event.context, jobUrl }
    const state = await services.store.read()
    const entry = { platform: event.platform, tabId, context, updatedAt: new Date().toISOString() }
    state.contexts = [...state.contexts.filter(value => !(value.platform === event.platform && value.tabId === tabId && value.context.sourceJobId === context.sourceJobId)), entry].slice(-100)
    await chrome.storage.local.set({ submissionContexts: state.contexts })
    await services.attachContexts(state)
    await services.store.save(state.attempts)
    return true
  }
} satisfies Pick<SubmissionHandlers, "context">
