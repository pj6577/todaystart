import { applicationPage, bridgeEventName, NumericIdSchema, saraminResult, type SubmissionEvent } from "./model"

// Native manifest MAIN-world entry, bundled directly by Parcel. Plasmo's
// dynamic MAIN registration adds scripting permission and can miss the first
// navigation; static registration requires neither a worker nor that permission.

const page = applicationPage(location.href)
let enabled = false
document.addEventListener("todaystart:submission-policy:v1", event => { enabled = (event as CustomEvent).detail === "enabled" })
if (page && !page.result && page.platform !== "wanted") install()
const detailJobId = location.protocol === "https:" && location.hostname === "www.jobkorea.co.kr" ? /^\/recruit\/gi_read\/(\d{1,20})\/?$/i.exec(location.pathname)?.[1] : undefined
const listing = location.protocol === "https:" && location.hostname === "www.jobkorea.co.kr" && /^\/(?:search|recruit\/joblist)\/?$/i.test(location.pathname)
let clickedPosting: { id: string; at: number } | undefined
if (listing) document.addEventListener("click", event => {
  if (!event.isTrusted || !(event.target instanceof Element)) return
  const card = event.target.closest('[data-sentry-component="CardJob"],tr.devloopArea')
  const link = card?.querySelector<HTMLAnchorElement>('a[data-sentry-component="Title"][href],.tplTit .titBx strong a.link[href]')
  try {
    const url = link && new URL(link.href)
    const id = url?.origin === location.origin && /^\/recruit\/gi_read\/(\d{1,20})\/?$/i.exec(url.pathname)?.[1]
    clickedPosting = id ? { id, at: Date.now() } : undefined
  } catch { clickedPosting = undefined }
}, true)
if (detailJobId || listing) {
  // React apply buttons have no href/giNo. Observe the actual popup target,
  // before native open/noopener detaches the source document. Do not submit.
  const nativeOpen = window.open
  window.open = function (...args: Parameters<typeof window.open>) {
    if (enabled) {
      try {
        const target = applicationPage(new URL(String(args[0]), location.href).href)
        const sourceJobId = detailJobId || (clickedPosting && Date.now() - clickedPosting.at < 5000 ? clickedPosting.id : undefined)
        if (sourceJobId && target?.platform === "jobkorea" && !target.result && target.jobId) emit({ kind: "popup_link", platform: "jobkorea", sourceJobId, internalGiNo: target.jobId, launchId: crypto.randomUUID() })
      } catch { /* Preserve native popup behavior. */ }
    }
    return Reflect.apply(nativeOpen, this, args)
  }
}
// Whichever world initializes last requests/replies to the policy handshake.
// Otherwise a fast initial policy reply can be lost before MAIN has loaded.
if (page && !page.result || detailJobId || listing) document.dispatchEvent(new CustomEvent("todaystart:submission-policy-request:v1"))

function emit(event: SubmissionEvent) {
  // Synchronous delivery starts the extension IPC before native form.submit()
  // unloads the document. Page-world data is treated as untrusted by the worker.
  try { document.dispatchEvent(new CustomEvent(bridgeEventName, { detail: JSON.stringify(event) })) } catch { /* Never interrupt the site's submission. */ }
}
function jobId(form?: HTMLFormElement) {
  if (page?.jobId) return page.jobId
  const field = form?.querySelector<HTMLInputElement>('input[name="giNo"],input[name="GiNo"],input[name="gino"]')
  return NumericIdSchema.safeParse(field?.value).success ? field!.value : undefined
}
function install() {
  if (page!.platform === "jobkorea") {
    const nativeSubmit = HTMLFormElement.prototype.submit
    const observe = (form: HTMLFormElement) => {
      if (!enabled) return
      try {
        const action = new URL(form.action, location.href)
        const id = jobId(form)
        if (id && form.method.toLowerCase() === "post" && action.origin === location.origin && /^\/recruit\/onpass\/onpassapply\/?$/i.test(action.pathname)) {
          const requestId = crypto.randomUUID()
          emit({ kind: "submitting", platform: "jobkorea", sourceJobId: id, requestId })
          setTimeout(() => emit({ kind: "result", platform: "jobkorea", sourceJobId: id, requestId, outcome: "unverified" }), 45000)
        }
      } catch { /* Preserve native form semantics. */ }
    }
    HTMLFormElement.prototype.submit = function () { observe(this); return Reflect.apply(nativeSubmit, this, []) }
    document.addEventListener("submit", event => {
      // requestSubmit/native user submission runs validation first. A cancelled
      // event is not a submitted request. No synthetic button click is counted.
      const form = event.target
      if (event.isTrusted && form instanceof HTMLFormElement) queueMicrotask(() => { if (!event.defaultPrevented) observe(form) })
    }, true)
    return
  }
  const target = (raw: string, method: string) => {
    try { const url = new URL(raw, location.href); return method.toUpperCase() === "POST" && url.origin === location.origin && url.pathname === "/zf_user/member/apply/apply" }
    catch { return false }
  }
  const begin = () => {
    if (!enabled) return
    const id = jobId()
    if (!id) return
    const requestId = crypto.randomUUID()
    emit({ kind: "submitting", platform: "saramin", sourceJobId: id, requestId })
    let done = false
    const finish = (value?: unknown) => {
      if (done) return
      done = true; clearTimeout(timeout)
      emit({ kind: "result", platform: "saramin", sourceJobId: id, requestId, ...saraminResult(value, id) })
    }
    const timeout = setTimeout(() => finish(), 45000)
    return finish
  }
  const originalFetch = window.fetch
  window.fetch = function (...args: Parameters<typeof fetch>) {
    let matches = false
    try { const input = args[0]; matches = target(input instanceof Request ? input.url : String(input), args[1]?.method || (input instanceof Request ? input.method : "GET")) } catch { /* Pass through. */ }
    const finish = matches ? begin() : undefined
    let promise: ReturnType<typeof fetch>
    try { promise = Reflect.apply(originalFetch, this, args) } catch (error) { finish?.(); throw error }
    if (finish) void promise.then(response => {
      // Clone the response; the site's own reader and promise are untouched.
      if (!response.ok || response.redirected || !target(response.url, "POST")) { finish(); return }
      const length = Number(response.headers.get("content-length"))
      if (length > 262144) { finish(); return }
      void readResponse(response.clone()).then(value => finish(enabled ? value : undefined), () => finish())
    }, () => finish()).catch(() => finish())
    return promise
  }
  const nativeOpen = XMLHttpRequest.prototype.open
  const nativeSend = XMLHttpRequest.prototype.send
  const requests = new WeakMap<XMLHttpRequest, boolean>()
  XMLHttpRequest.prototype.open = function (...args: [method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null]) {
    requests.set(this, target(String(args[1]), args[0]))
    return Reflect.apply(nativeOpen, this, args)
  }
  XMLHttpRequest.prototype.send = function (...args: Parameters<XMLHttpRequest["send"]>) {
    const finish = requests.get(this) ? begin() : undefined
    const result = () => {
      if (!finish) return
      try {
        if (!enabled) { finish(); return }
        if (this.status < 200 || this.status >= 300 || !target(this.responseURL, "POST")) { finish(); return }
        if (this.responseType === "json") finish(this.response)
        else if ((this.responseType === "" || this.responseType === "text") && this.responseText.length <= 262144) finish(JSON.parse(this.responseText))
        else finish()
      } catch { finish() }
    }
    // readyState DONE precedes load: sites can remove the iframe in onload.
    // Keep loadend as the fallback for abort/error paths.
    if (finish) {
      const ready = () => {
        if (this.readyState !== XMLHttpRequest.DONE) return
        this.removeEventListener("readystatechange", ready, true)
        result()
      }
      this.addEventListener("readystatechange", ready, true)
      this.addEventListener("load", result, { once: true, capture: true })
      this.addEventListener("loadend", result, { once: true, capture: true })
    }
    try { return Reflect.apply(nativeSend, this, args) } catch (error) { finish?.(); throw error }
  }
}

async function readResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) return
  let bytes = 0, text = ""
  const decoder = new TextDecoder()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (!enabled || bytes > 262144) { void reader.cancel().catch(() => undefined); return }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    return JSON.parse(text)
  } finally { reader.releaseLock() }
}
