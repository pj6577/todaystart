import { lifetime } from "./store"
import type { SubmissionHandlers } from "./event-context"

export const wantedEvents = {
  async wanted_submit(event, { frameId, page, sender }, services) {
    if (frameId !== 0 || page?.platform !== "wanted" || page.result || page.jobId !== event.context.sourceJobId) throw new Error("원티드 제출 공고가 다릅니다.")
    await services.observe({ kind: "context", platform: "wanted", context: event.context }, sender)
    return services.observe({ kind: "apply_clicked", platform: "wanted", sourceJobId: event.context.sourceJobId }, sender)
  },
  async wanted_completed(event, { tabId, frameId, page }, services) {
    if (frameId !== 0 || page?.platform !== "wanted" || !page.result || page.jobId !== event.sourceJobId) throw new Error("원티드 지원 완료 경로가 다릅니다.")
    const { attempts } = await services.store.read()
    const candidates = attempts.filter(attempt => attempt.platform === "wanted" && attempt.tabId === tabId && attempt.frameId === frameId && attempt.sourceJobId === event.sourceJobId && attempt.clickedAt && Date.now() - Date.parse(attempt.startedAt) < lifetime)
    const pending = candidates.filter(attempt => attempt.stage !== "confirmed")
    if (pending.length !== 1) return pending.length === 0 && candidates.some(attempt => attempt.stage === "confirmed")
    const attempt = pending[0]!
    attempt.stage = "confirmed"; attempt.reason = "success"; attempt.confirmationMethod = "completion_page"; attempt.updatedAt = new Date().toISOString()
    await services.materialize(attempt)
    await services.store.save(attempts)
    return true
  }
} satisfies Pick<SubmissionHandlers, "wanted_submit" | "wanted_completed">
