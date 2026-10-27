import { z } from "zod"
import { applicationPage, SubmissionAttemptSchema, type SubmissionAttempt, type SubmissionEvent, SubmissionContextSchema, SubmissionPlatformSchema } from "./model"
import { platformForUrl, jobIdFromUrl, safeJobUrl } from "../core/urls"
import { DomPlatformAdapter } from "../platforms/adapter"
import { normalizeCompanyName } from "../core/company"
import { applicationIdentity } from "../core/identity"
import type { ApplicationRecord } from "../core/model"
import type { ApplicationRepository } from "../storage/repository"
import { publicPostingProfileFor } from "../platforms/public-postings"

const contextSchema = z.object({ platform: SubmissionPlatformSchema, tabId: z.number().int(), updatedAt: z.string().datetime(), context: SubmissionContextSchema }).strict()
const handoffSchema = z.object({ tabId: z.number().int(), sourceJobId: z.string().regex(/^\d{1,20}$/), internalGiNo: z.string().regex(/^\d{1,20}$/), observedAt: z.string().datetime(), launchId: z.string().uuid().optional(), targetTabId: z.number().int().optional(), targetFrameId: z.number().int().optional() }).strict()
type Handoff = z.infer<typeof handoffSchema>
const handoffLifetime = 5 * 60 * 1000
const lifetime = 24 * 60 * 60 * 1000
const kstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

// Called only from the worker's serialized message queue. Pending attempts are
// local, bounded, and contain no form body, resume, account, or raw URL query.
export class SubmissionTracker {
  constructor(private readonly repository: ApplicationRepository) {}
  private async read() {
    const stored = await chrome.storage.local.get(["submissionAttempts", "submissionContexts", "submissionHandoffs"])
    const attempts = z.array(SubmissionAttemptSchema).safeParse(stored.submissionAttempts)
    const contexts = z.array(contextSchema).safeParse(stored.submissionContexts)
    const handoffs = z.array(handoffSchema).safeParse(stored.submissionHandoffs)
    return { attempts: attempts.success ? attempts.data.slice(-100) : [], contexts: contexts.success ? contexts.data.filter(value => Date.now() - Date.parse(value.updatedAt) < lifetime).slice(-100) : [], handoffs: handoffs.success ? handoffs.data.filter(value => { const age = Date.now() - Date.parse(value.observedAt); return age >= 0 && age < handoffLifetime }).slice(-100) : [] }
  }
  private async save(attempts: SubmissionAttempt[]) {
    await chrome.storage.local.set({ submissionAttempts: attempts.slice(-100) })
  }
  private async attachContexts(state: Awaited<ReturnType<SubmissionTracker["read"]>>) {
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
        await this.materialize(attempt)
      }
    }
    await chrome.storage.local.set({ submissionHandoffs: state.handoffs.slice(-100) })
  }
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
    const { attempts } = await this.read()
    let changed = false
    for (const attempt of attempts) {
      if (attempt.stage === "submitting" && Date.now() - Date.parse(attempt.updatedAt) >= 45000) {
        attempt.stage = "unverified"; attempt.reason = "timeout"; attempt.updatedAt = new Date().toISOString()
        await this.materialize(attempt); changed = true
      }
    }
    if (changed) await this.save(attempts)
    return attempts
  }
  async observe(event: SubmissionEvent, sender: chrome.runtime.MessageSender): Promise<boolean> {
    const tabId = sender.tab?.id, frameId = sender.frameId
    const rawUrl = sender.url
    if (!tabId || frameId === undefined || !rawUrl || platformForUrl(rawUrl) !== event.platform) throw new Error("지원 흐름의 출처를 확인해 주세요.")
    const page = applicationPage(rawUrl)
    if (event.kind === "wanted_submit") {
      if (frameId !== 0 || page?.platform !== "wanted" || page.result || page.jobId !== event.context.sourceJobId) throw new Error("원티드 제출 공고가 다릅니다.")
      await this.observe({ kind: "context", platform: "wanted", context: event.context }, sender)
      return this.observe({ kind: "apply_clicked", platform: "wanted", sourceJobId: event.context.sourceJobId }, sender)
    }
    const adapter = new DomPlatformAdapter(event.platform)
    const publicListing = event.platform === "jobkorea" && adapter.isJobListingPage(rawUrl) && !!publicPostingProfileFor("jobkorea", rawUrl)
    if (event.kind === "popup_link") {
      const state = await this.read()
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
      await this.attachContexts(state)
      await this.save(state.attempts)
      return true
    }
    if (event.kind === "context") {
      const samePosting = adapter.isJobDetailPage(rawUrl) && jobIdFromUrl(rawUrl) === event.context.sourceJobId
      const sameApplication = page && (event.platform === "jobkorea"
        ? !page.result && page.jobId === (event.context.internalGiNo || event.context.sourceJobId)
        : page.jobId === event.context.sourceJobId)
      if (!samePosting && !sameApplication && !(publicListing && frameId === 0)) throw new Error("공고 정보의 출처가 다릅니다.")
      if (event.platform !== "jobkorea" && event.context.internalGiNo) throw new Error("지원창 식별자의 출처가 다릅니다.")
      const jobUrl = safeJobUrl(event.context.jobUrl, event.platform)
      if (!jobUrl || !adapter.isJobDetailPage(jobUrl) || jobIdFromUrl(jobUrl) !== event.context.sourceJobId) throw new Error("공고 주소를 확인해 주세요.")
      const context = { ...event.context, jobUrl }
      const state = await this.read()
      const entry = { platform: event.platform, tabId, context, updatedAt: new Date().toISOString() }
      state.contexts = [...state.contexts.filter(value => !(value.platform === event.platform && value.tabId === tabId && value.context.sourceJobId === context.sourceJobId)), entry].slice(-100)
      await chrome.storage.local.set({ submissionContexts: state.contexts })
      await this.attachContexts(state)
      await this.save(state.attempts)
      return true
    }
    if (event.kind === "wanted_completed") {
      if (frameId !== 0 || page?.platform !== "wanted" || !page.result || page.jobId !== event.sourceJobId) throw new Error("원티드 지원 완료 경로가 다릅니다.")
      const { attempts } = await this.read()
      const candidates = attempts.filter(attempt => attempt.platform === "wanted" && attempt.tabId === tabId && attempt.frameId === frameId && attempt.sourceJobId === event.sourceJobId && attempt.clickedAt && Date.now() - Date.parse(attempt.startedAt) < lifetime)
      const pending = candidates.filter(attempt => attempt.stage !== "confirmed")
      if (pending.length !== 1) return pending.length === 0 && candidates.some(attempt => attempt.stage === "confirmed")
      const attempt = pending[0]!
      attempt.stage = "confirmed"; attempt.reason = "success"; attempt.confirmationMethod = "completion_page"; attempt.updatedAt = new Date().toISOString()
      await this.materialize(attempt)
      await this.save(attempts)
      return true
    }
    if (event.kind === "completed") {
      // Completion is a new document. Match Chrome's actual sender URL rather
      // than the iframe src attribute or an old POST document/request ID.
      const url = new URL(rawUrl)
      if (page?.platform !== "saramin" || !page.result || page.jobId !== event.sourceJobId || url.searchParams.get("recruitapply_idx") !== event.sourceApplicationId) throw new Error("지원 완료 화면의 식별자가 다릅니다.")
      const { attempts, contexts } = await this.read()
      let attempt = [...attempts].reverse().find(value => value.platform === event.platform && value.tabId === tabId && value.frameId === frameId && value.sourceJobId === event.sourceJobId && (value.sourceApplicationId === event.sourceApplicationId || value.stage !== "confirmed"))
      if (!attempt) {
        const metadata = contexts.filter(value => value.platform === event.platform && value.context.sourceJobId === event.sourceJobId && (value.tabId === tabId || value.tabId === sender.tab?.openerTabId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
        const now = new Date().toISOString()
        attempt = { id: crypto.randomUUID(), platform: event.platform, tabId, openerTabId: sender.tab?.openerTabId, frameId, documentId: sender.documentId, sourceJobId: event.sourceJobId, context: metadata?.context, stage: "confirmed", reason: "success", confirmationMethod: "completion_page", sourceApplicationId: event.sourceApplicationId, startedAt: now, updatedAt: now }
        attempts.push(attempt)
      } else if (attempt.stage !== "confirmed") {
        attempt.stage = "confirmed"; attempt.reason = "success"; attempt.confirmationMethod = "completion_page"; attempt.sourceApplicationId = event.sourceApplicationId; attempt.updatedAt = new Date().toISOString()
      }
      await this.materialize(attempt)
      await this.save(attempts)
      return true
    }
    if (event.kind === "completion_marker") {
      const postingId = publicListing && frameId === 0 ? event.postingId : adapter.isJobDetailPage(rawUrl) ? jobIdFromUrl(rawUrl) : undefined
      if (event.postingId && event.postingId !== postingId) throw new Error("완료 공고 식별자가 다릅니다.")
      if (page?.platform !== "jobkorea" && !postingId) throw new Error("지원 완료 표시의 출처를 확인해 주세요.")
      if (/\/onpassresult\/?$/i.test(new URL(rawUrl).pathname) && !page?.postingId) return false
      const { attempts } = await this.read()
      const candidates = attempts.filter(attempt => attempt.platform === "jobkorea" && (attempt.requestId || attempt.clickedAt) && Date.now() - Date.parse(attempt.startedAt) < lifetime &&
        (postingId ? frameId === 0 && attempt.context?.sourceJobId === postingId && (attempt.tabId === tabId || attempt.openerTabId === tabId || attempt.contextTabId === tabId)
          : attempt.tabId === tabId && attempt.frameId === frameId && (!page?.jobId || page.jobId === attempt.sourceJobId) && (!page?.postingId || page.postingId === attempt.context?.sourceJobId)))
      // The result URL may omit giNo. An ambiguous result must not confirm a
      // different application, and a pre-existing button is not a new submit.
      const pending = candidates.filter(attempt => attempt.stage !== "confirmed")
      if (pending.length !== 1) return pending.length === 0 && candidates.some(attempt => attempt.stage === "confirmed")
      const attempt = pending[0]!
      attempt.stage = "confirmed"; attempt.reason = "success"; attempt.confirmationMethod = "completion_marker"; attempt.updatedAt = new Date().toISOString()
      await this.materialize(attempt)
      await this.save(attempts)
      return true
    }
    if (event.kind !== "landed" && (!page || page.result || ("sourceJobId" in event && ((page.jobId && page.jobId !== event.sourceJobId) || (event.platform === "jobkorea" && page.jobId !== event.sourceJobId))))) throw new Error("지원 화면에서 발생한 제출만 확인합니다.")
    if (event.kind === "result" && event.outcome === "success" && (event.platform !== "saramin" || !event.sourceApplicationId)) throw new Error("지원 완료 응답의 근거가 없습니다.")
    const state = await this.read()
    const { attempts } = state
    const now = new Date().toISOString()
    if (event.kind === "landed") {
      if (event.platform !== "jobkorea") throw new Error("지원 결과 이동을 확인해 주세요.")
      for (const attempt of attempts) {
        if (attempt.platform === "jobkorea" && attempt.tabId === tabId && attempt.frameId === frameId && attempt.documentId !== sender.documentId && attempt.stage === "submitting") {
          attempt.stage = "unverified"; attempt.reason = "navigation"; attempt.updatedAt = now
          await this.materialize(attempt)
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
      await this.materialize(attempt)
    } else {
      let attempt = [...attempts].reverse().find(value => value.platform === event.platform && value.tabId === tabId && value.frameId === frameId && value.sourceJobId === event.sourceJobId && value.stage !== "confirmed" && Date.now() - Date.parse(value.startedAt) < lifetime)
      if (event.kind === "entered" && attempt?.documentId === sender.documentId) {
        await this.attachContexts(state); await this.save(attempts); return true
      }
      if (!attempt) {
        attempt = { id: crypto.randomUUID(), platform: event.platform, tabId, openerTabId: sender.tab?.openerTabId, frameId, documentId: sender.documentId, sourceJobId: event.sourceJobId, stage: "started", reason: "opened", startedAt: now, updatedAt: now }
        attempts.push(attempt)
      }
      await this.attachContexts(state)
      attempt.documentId = sender.documentId
      if (event.kind === "apply_clicked") {
        attempt.clickedAt = now
        attempt.stage = "submitting"; attempt.reason = "waiting"; attempt.updatedAt = now
      }
      if (event.kind === "submitting") {
        if (attempt.requestId === event.requestId) { await this.save(attempts); return true }
        attempt.stage = "submitting"; attempt.reason = "waiting"; attempt.requestId = event.requestId; attempt.updatedAt = now
        await this.materialize(attempt)
      }
    }
    await this.save(attempts)
    return true
  }
  async closeTab(tabId: number) {
    const { attempts } = await this.read()
    for (const attempt of attempts) if (attempt.tabId === tabId && (attempt.stage === "started" || attempt.stage === "submitting")) {
      attempt.stage = "unverified"; attempt.reason = "closed"; attempt.updatedAt = new Date().toISOString()
      await this.materialize(attempt)
    }
    await this.save(attempts)
  }
  async reconcile() {
    const { attempts } = await this.read()
    const records = await this.repository.list()
    let changed = false
    for (const attempt of attempts) {
      const record = records.find(value => value.submissionAttemptId === attempt.id && value.status === "applied")
      if (record && attempt.stage !== "confirmed") { attempt.stage = "confirmed"; attempt.reason = record.evidence === "manual" ? "manual" : "success"; attempt.updatedAt = new Date().toISOString(); changed = true }
    }
    if (changed) await this.save(attempts)
  }
}
