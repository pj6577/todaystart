import type { SubmissionHandlers } from "./event-context"

export const saraminEvents = {
  async completed(event, { tabId, frameId, rawUrl, page, sender }, services) {
    // Completion is a new document. Match Chrome's actual sender URL rather
    // than the iframe src attribute or an old POST document/request ID.
    const url = new URL(rawUrl)
    if (page?.platform !== "saramin" || !page.result || page.jobId !== event.sourceJobId || url.searchParams.get("recruitapply_idx") !== event.sourceApplicationId) throw new Error("지원 완료 화면의 식별자가 다릅니다.")
    const { attempts, contexts } = await services.store.read()
    let attempt = [...attempts].reverse().find(value => value.platform === event.platform && value.tabId === tabId && value.frameId === frameId && value.sourceJobId === event.sourceJobId && (value.sourceApplicationId === event.sourceApplicationId || value.stage !== "confirmed"))
    if (!attempt) {
      const metadata = contexts.filter(value => value.platform === event.platform && value.context.sourceJobId === event.sourceJobId && (value.tabId === tabId || value.tabId === sender.tab?.openerTabId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
      const now = new Date().toISOString()
      attempt = { id: crypto.randomUUID(), platform: event.platform, tabId, openerTabId: sender.tab?.openerTabId, frameId, documentId: sender.documentId, sourceJobId: event.sourceJobId, context: metadata?.context, stage: "confirmed", reason: "success", confirmationMethod: "completion_page", sourceApplicationId: event.sourceApplicationId, startedAt: now, updatedAt: now }
      attempts.push(attempt)
    } else if (attempt.stage !== "confirmed") {
      attempt.stage = "confirmed"; attempt.reason = "success"; attempt.confirmationMethod = "completion_page"; attempt.sourceApplicationId = event.sourceApplicationId; attempt.updatedAt = new Date().toISOString()
    }
    await services.materialize(attempt)
    await services.store.save(attempts)
    return true
  }
} satisfies Pick<SubmissionHandlers, "completed">
