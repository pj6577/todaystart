import type { PlasmoCSConfig } from "plasmo"
import { applicationPage, bridgeEventName, saraminCompletion, SubmissionEventSchema, type SubmissionEvent } from "../submission/model"
import { DomPlatformAdapter } from "../platforms/adapter"
import { platformForUrl, jobIdFromUrl } from "../core/urls"
import { rpc } from "../messaging/protocol"
import { hasJobkoreaCompletion, hasJobkoreaCompletionTransition } from "../submission/completion-marker"
import { isJobkoreaApplyClick } from "../submission/jobkorea-apply"
import { publicPostingProfileFor } from "../platforms/public-postings"

export const config: PlasmoCSConfig = {
  matches: ["https://www.saramin.co.kr/*", "https://www.jobkorea.co.kr/*"],
  all_frames: true, run_at: "document_start"
}
const platform = platformForUrl(location.href)
function send(event: SubmissionEvent) {
  // Send immediately, before form navigation can destroy this context. The
  // service worker serializes messages; do not wait for earlier replies here.
  void rpc({ type: "submission", event }).catch(() => undefined)
}
const application = applicationPage(location.href)
function refreshPolicy() {
  void rpc({ type: "submission_policy" }).then(policy => document.dispatchEvent(new CustomEvent("todaystart:submission-policy:v1", { detail: policy.enabled ? "enabled" : "disabled" }))).catch(() => undefined)
}
const jobkoreaDetail = platform === "jobkorea" && new DomPlatformAdapter(platform).isJobDetailPage(location.href)
const jobkoreaListing = platform === "jobkorea" && new DomPlatformAdapter(platform).isJobListingPage(location.href) && !!publicPostingProfileFor(platform, location.href)
const completionPage = application || jobkoreaDetail || jobkoreaListing
if (completionPage) {
  document.addEventListener("todaystart:submission-policy-request:v1", refreshPolicy)
  if (!application?.result) refreshPolicy()
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && !sender.tab && message?.type === "DATA_CHANGED") {
      if (!application?.result) refreshPolicy()
      checkCompletion()
    }
  })
}
if (platform === "jobkorea") send({ kind: "landed", platform })
if ((application && !application.result) || jobkoreaDetail || jobkoreaListing) {
  document.addEventListener(bridgeEventName, event => {
    const detail = (event as CustomEvent).detail
    if (typeof detail !== "string" || detail.length > 2048) return
    try {
      const parsed = SubmissionEventSchema.safeParse(JSON.parse(detail))
      if (!parsed.success || parsed.data.platform !== platform) return
      const data = parsed.data
      if (data.kind === "popup_link" && (jobkoreaDetail && data.sourceJobId === jobIdFromUrl(location.href) || jobkoreaListing && new DomPlatformAdapter("jobkorea").extractJobPostings(document).some(posting => posting.sourceJobId === data.sourceJobId))) {
        pendingPostingId = data.sourceJobId
        pendingLinkedGiNo = data.internalGiNo
        context(pendingLinkedGiNo, pendingPostingId)
        send(parsed.data)
      } else if (application && !application.result && ["submitting", "result"].includes(parsed.data.kind)) {
        context()
        send(parsed.data)
      }
    } catch { /* Ignore page events that aren't the narrow bridge protocol. */ }
  })
  if (application?.jobId) send({ kind: "entered", platform: application.platform, sourceJobId: application.jobId })
}

let lastContext = ""
let pendingLinkedGiNo: string | undefined
let pendingPostingId: string | undefined
let clickedAt = 0
let finalClickObserved = false
let completionBeforeClick = new Set<Element>()
const linkedFrames = new WeakMap<HTMLIFrameElement, string>()
let linkedPosting: { sourceJobId: string; internalGiNo: string } | undefined
function context(linkedGiNo = pendingLinkedGiNo, postingId = pendingPostingId) {
  if (platform !== "saramin" && platform !== "jobkorea") return
  for (const getDocument of [() => document, () => window.top?.document, () => window.opener?.document as Document | undefined]) {
    try {
      const doc = getDocument()
      if (!doc || platformForUrl(doc.URL) !== platform) continue
      const adapter = new DomPlatformAdapter(platform)
      const detail = adapter.isJobDetailPage(doc.URL)
      if (!detail && (!postingId || !adapter.isJobListingPage(doc.URL))) continue
      const posting = adapter.extractJobPostings(doc).find(value => !postingId || value.sourceJobId === postingId)
      const sourceJobId = posting?.sourceJobId || jobIdFromUrl(posting?.jobUrl)
      if (!posting?.companyName || !posting.jobTitle || !posting.jobUrl || !sourceJobId || (platform === "saramin" && application?.jobId && application.jobId !== sourceJobId)) continue
      // GI_Read identifies the public posting; OnPass giNo is a separate ID.
      // A same-origin parent/opener or an actual OnPass link supplies the map.
      if (platform === "jobkorea" && linkedGiNo) linkedPosting = { sourceJobId, internalGiNo: linkedGiNo }
      const internalGiNo = platform === "jobkorea" ? application?.jobId || (linkedPosting?.sourceJobId === sourceJobId ? linkedPosting.internalGiNo : undefined) : undefined
      const value = { sourceJobId, companyName: posting.companyName, jobTitle: posting.jobTitle, jobUrl: posting.jobUrl, ...(internalGiNo ? { internalGiNo } : {}) }
      const signature = JSON.stringify(value)
      if (signature !== lastContext) {
        lastContext = signature
        void rpc({ type: "submission", event: { kind: "context", platform, context: value } }).catch(() => { if (lastContext === signature) lastContext = "" })
      }
      break
    } catch { /* Cross-origin parents/openers are never read. */ }
  }
}
// Explicit links also cover popup windows opened with noopener. No form values
// or arbitrary onclick JavaScript are read to infer the internal ID.
document.addEventListener("click", event => {
  if (!event.isTrusted || platform !== "jobkorea" || !(event.target instanceof Element)) return
  if (application) {
    if (!application.result && application.jobId && isJobkoreaApplyClick(event.target)) {
      completionBeforeClick = new Set([...document.querySelectorAll("button")].filter(button => button.textContent?.replace(/\s+/g, "") === "추가지원"))
      finalClickObserved = true
      context()
      send({ kind: "apply_clicked", platform: "jobkorea", sourceJobId: application.jobId })
    }
    return
  }
  if (jobkoreaListing) {
    const posting = new DomPlatformAdapter("jobkorea").extractJobPostings(document).find(value => value.element?.contains(event.target as Node))
    if (!posting?.sourceJobId) return
    for (const frame of document.querySelectorAll<HTMLIFrameElement>("iframe[src]")) linkedFrames.set(frame, applicationPage(frame.src)?.jobId || "")
    pendingPostingId = posting.sourceJobId
    pendingLinkedGiNo = undefined
    clickedAt = Date.now()
    context(undefined, pendingPostingId)
  }
  const link = event.target.closest<HTMLAnchorElement>("a[href]")
  const target = link && applicationPage(link.href)
  if ((jobkoreaDetail || jobkoreaListing) && target?.platform === "jobkorea" && !target.result && target.jobId) {
    pendingLinkedGiNo = target.jobId
    context(target.jobId)
    const sourceJobId = jobkoreaDetail ? jobIdFromUrl(location.href) : pendingPostingId
    if (sourceJobId) send({ kind: "popup_link", platform: "jobkorea", sourceJobId, internalGiNo: target.jobId, launchId: crypto.randomUUID() })
  }
}, true)

const completionSent = new Set<string>(), completionPending = new Set<string>(), completionFailures = new Map<string, number>()
function checkCompletion() {
  if (jobkoreaListing) {
    for (const posting of new DomPlatformAdapter("jobkorea").extractJobPostings(document)) {
      if (posting.sourceJobId && posting.element && hasJobkoreaCompletion(document, posting.element)) sendCompletion({ kind: "completion_marker", platform: "jobkorea", postingId: posting.sourceJobId }, posting.sourceJobId)
    }
    return
  }
  const completed = application?.platform === "jobkorea" && !application.result && finalClickObserved
    ? hasJobkoreaCompletionTransition(document, completionBeforeClick)
    : hasJobkoreaCompletion(document)
  const event = platform === "jobkorea" && completionPage && completed
    ? { kind: "completion_marker" as const, platform: "jobkorea" as const }
    : application?.platform === "saramin" && application.result ? saraminCompletion(location.href, document.body?.innerText) : undefined
  if (!event) return
  sendCompletion(event, "document")
}
function sendCompletion(event: SubmissionEvent, key: string) {
  if (completionSent.has(key) || completionPending.has(key)) return
  completionPending.add(key)
  const retry = () => {
    const count = (completionFailures.get(key) || 0) + 1
    completionFailures.set(key, count)
    if (count <= 3) setTimeout(checkCompletion, 1000)
  }
  void rpc({ type: "submission", event }).then(saved => {
    if (saved) completionSent.add(key)
    // The posting and popup send from different documents. A visible result
    // can reach the worker just before its click/context message does.
    if (!saved) retry()
  }).catch(retry).finally(() => { completionPending.delete(key) })
}
let discoverContext = true
function observeDocument() {
  if (jobkoreaListing && pendingPostingId && Date.now() - clickedAt < 5000) {
    for (const frame of document.querySelectorAll<HTMLIFrameElement>("iframe[src]")) {
      const target = applicationPage(frame.src)
      if (target?.platform !== "jobkorea" || target.result || !target.jobId || linkedFrames.get(frame) === target.jobId) continue
      linkedFrames.set(frame, target.jobId)
      pendingLinkedGiNo = target.jobId
      context(target.jobId, pendingPostingId)
      send({ kind: "popup_link", platform: "jobkorea", sourceJobId: pendingPostingId, internalGiNo: target.jobId, launchId: crypto.randomUUID() })
    }
  }
  if (discoverContext) context()
  checkCompletion()
}
document.addEventListener("DOMContentLoaded", observeDocument, { once: true })
if (document.readyState !== "loading") observeDocument()
// A person may fill a form for minutes, and SPA headers may arrive late.
// Keep missing metadata discovery and completion observation active on supported pages.
const observer = new MutationObserver(observeDocument)
function discover() { if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "data-activity", "data-applymode", "disabled", "hidden", "aria-hidden", "style", "src"] }) }
discover()
document.addEventListener("DOMContentLoaded", discover, { once: true })
setTimeout(() => { if (lastContext) discoverContext = false; if (!completionPage) observer.disconnect() }, 15000)
