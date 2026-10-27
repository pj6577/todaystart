import type { PlasmoCSConfig } from "plasmo"
import { rpc } from "../messaging/protocol"
import { applicationPage, SubmissionContextSchema, type SubmissionEvent } from "../submission/model"

export const config: PlasmoCSConfig = {
  matches: ["https://www.wanted.co.kr/*"],
  all_frames: false, run_at: "document_start"
}

// The supplied modal exposes public posting metadata on its final control.
// Do not read inputs, request bodies, data-email, data-apply-id or resume IDs.
const submitSelector = 'button[data-attribute-id="apply__done__net"][data-position-id]'
let enabled: boolean | undefined
const entered = new WeakSet<Element>()
const completed = new Set<string>(), completing = new Set<string>(), failures = new Map<string, number>()

function send(event: SubmissionEvent) { void rpc({ type: "submission", event }).catch(() => undefined) }
function metadata(button: HTMLButtonElement) {
  const page = applicationPage(location.href)
  if (page?.platform !== "wanted" || page.result || page.jobId !== button.getAttribute("data-position-id")) return
  const parsed = SubmissionContextSchema.safeParse({
    sourceJobId: page.jobId,
    companyName: button.getAttribute("data-company-name"),
    jobTitle: button.getAttribute("data-position-name"),
    jobUrl: `https://www.wanted.co.kr/wd/${page.jobId}`
  })
  return parsed.success ? parsed.data : undefined
}
function visible(element: HTMLElement) {
  if (!element.getClientRects().length || element.closest('[hidden],[aria-hidden="true"],[inert]')) return false
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false
  }
  return true
}
function inspect() {
  if (!enabled) return
  const page = applicationPage(location.href)
  if (page?.platform !== "wanted" || !page.jobId) return
  if (page.result) {
    const id = page.jobId
    if (completed.has(id) || completing.has(id) || (failures.get(id) || 0) >= 4) return
    completing.add(id)
    void rpc<boolean>({ type: "submission", event: { kind: "wanted_completed", platform: "wanted", sourceJobId: id } }).then(saved => {
      if (saved) completed.add(id)
      else retry(id)
    }).catch(() => retry(id)).finally(() => completing.delete(id))
    return
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(submitSelector)) {
    if (entered.has(button) || !visible(button)) continue
    const context = metadata(button)
    if (!context) continue
    entered.add(button)
    send({ kind: "context", platform: "wanted", context })
    send({ kind: "entered", platform: "wanted", sourceJobId: context.sourceJobId })
  }
}
function retry(id: string) {
  failures.set(id, (failures.get(id) || 0) + 1)
  if ((failures.get(id) || 0) < 4) setTimeout(inspect, 500)
}
document.addEventListener("click", event => {
  // The worker checks the persisted policy too. Do not lose a fast trusted
  // click while the initial policy response is still in flight.
  if (enabled === false || !event.isTrusted || !(event.target instanceof Element)) return
  const button = event.target.closest<HTMLButtonElement>(submitSelector)
  if (!button || button.disabled || button.closest('[aria-disabled="true"]') || !visible(button) || button.textContent?.replace(/\s+/g, "") !== "제출하기") return
  const context = metadata(button)
  if (!context) return
  completed.delete(context.sourceJobId); failures.delete(context.sourceJobId)
  // The analytics attribute says apply__done__net even before submission.
  // A trusted click is only an attempt; /wd/{same-id}/applied confirms it.
  send({ kind: "wanted_submit", platform: "wanted", context })
}, true)

function policy() {
  void rpc<{ enabled: boolean }>({ type: "submission_policy" }).then(value => {
    enabled = value.enabled
    failures.clear()
    inspect()
  }).catch(() => undefined)
}
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === chrome.runtime.id && !sender.tab && message?.type === "DATA_CHANGED") policy()
})
const observer = new MutationObserver(inspect)
function observe() {
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "aria-hidden", "disabled", "aria-disabled"] })
  inspect()
}
document.addEventListener("DOMContentLoaded", observe, { once: true })
observe()
window.addEventListener("popstate", inspect)
window.addEventListener("pageshow", inspect)
// Wanted can pushState without a full document load or a DOM mutation.
setInterval(inspect, 1000)
policy()
