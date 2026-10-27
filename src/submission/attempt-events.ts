import type { SubmissionEvent } from "./model"
import type { SubmissionHandlers, SubmissionSource, SubmissionServices } from "./event-context"
import { lifetime } from "./store"

type AttemptEvent = Extract<SubmissionEvent, { kind: "landed" | "result" | "entered" | "apply_clicked" | "submitting" }>
async function observeAttempt(event: AttemptEvent, { tabId, frameId, page, sender }: SubmissionSource, services: SubmissionServices): Promise<boolean> {
  if (event.kind !== "landed" && (!page || page.result || ("sourceJobId" in event && ((page.jobId && page.jobId !== event.sourceJobId) || (event.platform === "jobkorea" && page.jobId !== event.sourceJobId))))) throw new Error("지원 화면에서 발생한 제출만 확인합니다.")
  if (event.kind === "result" && event.outcome === "success" && (event.platform !== "saramin" || !event.sourceApplicationId)) throw new Error("지원 완료 응답의 근거가 없습니다.")
  const state = await services.store.read()
  const { attempts } = state
  const now = new Date().toISOString()
  if (event.kind === "landed") {
    if (event.platform !== "jobkorea") throw new Error("지원 결과 이동을 확인해 주세요.")
    for (const attempt of attempts) {
      if (attempt.platform === "jobkorea" && attempt.tabId === tabId && attempt.frameId === frameId && attempt.documentId !== sender.documentId && attempt.stage === "submitting") {
        attempt.stage = "unverified"; attempt.reason = "navigation"; attempt.updatedAt = now
        await services.materialize(attempt)
      }
    }
  } else if (event.kind === "result") {
    // A success response must belong to this document/frame's exact observed
    // POST. Old retries, other jobs, and unmatched success events are ignored.
    const attempt = attempts.find(value => value.platform === event.platform && value.tabId === tabId && value.frameId === frameId && value.documentId === sender.documentId && value.sourceJobId === event.sourceJobId && value.requestId === event.requestId)
    if (!attempt || attempt.stage === "confirmed") return false
    attempt.stage = event.outcome === "success" ? "confirmed" : "unverified"
    attempt.reason = event.outcome === "success" ? "success" : "result_unknown"
    attempt.sourceApplicationId = event.sourceApplicationId; attempt.updatedAt = now
    if (event.outcome === "success") attempt.confirmationMethod = "api_response"
    await services.materialize(attempt)
  } else {
    let attempt = [...attempts].reverse().find(value => value.platform === event.platform && value.tabId === tabId && value.frameId === frameId && value.sourceJobId === event.sourceJobId && value.stage !== "confirmed" && Date.now() - Date.parse(value.startedAt) < lifetime)
    if (event.kind === "entered" && attempt?.documentId === sender.documentId) {
      await services.attachContexts(state); await services.store.save(attempts); return true
    }
    if (!attempt) {
      attempt = { id: crypto.randomUUID(), platform: event.platform, tabId, openerTabId: sender.tab?.openerTabId, frameId, documentId: sender.documentId, sourceJobId: event.sourceJobId, stage: "started", reason: "opened", startedAt: now, updatedAt: now }
      attempts.push(attempt)
    }
    await services.attachContexts(state)
    attempt.documentId = sender.documentId
    if (event.kind === "apply_clicked") {
      attempt.clickedAt = now
      attempt.stage = "submitting"; attempt.reason = "waiting"; attempt.updatedAt = now
    }
    if (event.kind === "submitting") {
      if (attempt.requestId === event.requestId) { await services.store.save(attempts); return true }
      attempt.stage = "submitting"; attempt.reason = "waiting"; attempt.requestId = event.requestId; attempt.updatedAt = now
      await services.materialize(attempt)
    }
  }
  await services.store.save(attempts)
  return true
}
export const attemptEvents = { landed: observeAttempt, result: observeAttempt, entered: observeAttempt, apply_clicked: observeAttempt, submitting: observeAttempt } satisfies Pick<SubmissionHandlers, AttemptEvent["kind"]>
