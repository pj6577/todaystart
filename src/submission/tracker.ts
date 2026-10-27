import type { SubmissionAttempt, SubmissionEvent } from "./model"
import { normalizeCompanyName } from "../core/company"
import { applicationIdentity } from "../core/identity"
import type { ApplicationRepository } from "../storage/repository"
import { SubmissionStore } from "./store"
import { attachSubmissionContexts } from "./context-links"
import { submissionSource, dispatchSubmission } from "./events"

const kstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

// Called only from the worker's serialized message queue. Pending attempts are
// local, bounded, and contain no form body, resume, account, or raw URL query.
export class SubmissionTracker {
  private readonly store = new SubmissionStore()
  constructor(private readonly repository: ApplicationRepository) {}
  private async materialize(attempt: SubmissionAttempt) {
    if (!attempt.context || attempt.stage === "started" || (!attempt.requestId && attempt.stage !== "confirmed")) return
    const now = attempt.updatedAt
    const record = {
      platform: attempt.platform, ...attempt.context,
      normalizedCompanyName: normalizeCompanyName(attempt.context.companyName),
      sourceApplicationId: attempt.sourceApplicationId,
      submissionAttemptId: attempt.id, submissionStage: attempt.stage,
      // A successful response/completion observed now supplies an event date. Merely
      // opening/submitting an application must never invent its applied date.
      appliedAt: attempt.stage === "confirmed" ? kstDay(attempt.clickedAt || now) : undefined,
      appliedAtTime: attempt.stage === "confirmed" ? attempt.clickedAt || now : undefined,
      status: attempt.stage === "confirmed" ? "applied" as const : "pending_confirmation" as const,
      evidence: attempt.stage === "confirmed" ? attempt.confirmationMethod === "completion_page" || attempt.confirmationMethod === "completion_marker" ? "success_page" as const : "submission_result" as const : "submission_attempt" as const,
      collectedAt: attempt.startedAt, lastSeenAt: now, lastSyncedAt: now
    }
    await this.repository.merge([{ ...record, id: applicationIdentity(record) }])
    await chrome.storage.local.set({ revision: crypto.randomUUID() })
  }
  async snapshot() {
    const { attempts } = await this.store.read()
    let changed = false
    for (const attempt of attempts) {
      if (attempt.stage === "submitting" && Date.now() - Date.parse(attempt.updatedAt) >= 45000) {
        attempt.stage = "unverified"; attempt.reason = "timeout"; attempt.updatedAt = new Date().toISOString()
        await this.materialize(attempt); changed = true
      }
    }
    if (changed) await this.store.save(attempts)
    return attempts
  }
  async observe(event: SubmissionEvent, sender: chrome.runtime.MessageSender): Promise<boolean> {
    const source = submissionSource(event, sender)
    return dispatchSubmission(event, source, {
      store: this.store,
      materialize: attempt => this.materialize(attempt),
      attachContexts: state => attachSubmissionContexts(state, attempt => this.materialize(attempt)),
      observe: (next, origin) => this.observe(next, origin)
    })
  }
  async closeTab(tabId: number) {
    const { attempts } = await this.store.read()
    for (const attempt of attempts) if (attempt.tabId === tabId && (attempt.stage === "started" || attempt.stage === "submitting")) {
      attempt.stage = "unverified"; attempt.reason = "closed"; attempt.updatedAt = new Date().toISOString()
      await this.materialize(attempt)
    }
    await this.store.save(attempts)
  }
  async reconcile() {
    const { attempts } = await this.store.read()
    const records = await this.repository.list()
    let changed = false
    for (const attempt of attempts) {
      const record = records.find(value => value.submissionAttemptId === attempt.id && value.status === "applied")
      if (record && attempt.stage !== "confirmed") { attempt.stage = "confirmed"; attempt.reason = record.evidence === "manual" ? "manual" : "success"; attempt.updatedAt = new Date().toISOString(); changed = true }
    }
    if (changed) await this.store.save(attempts)
  }
}
