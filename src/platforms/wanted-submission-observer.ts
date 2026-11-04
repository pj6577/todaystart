import { applicationPage } from "../submission/model"

// Keep route polling cheap and retain only the public final-submit controls.
// Listing/home pages never need a document-wide submission observer.
export class WantedSubmissionObserver {
  private readonly observer = new MutationObserver(mutations => this.changed(mutations))
  private readonly controls = new Set<HTMLButtonElement>()
  private readonly listeners: (() => void)[] = []
  private enabled = false
  private started = false
  private disposed = false
  private suspended = false
  private previousUrl = ""
  private timer?: ReturnType<typeof setTimeout>
  private routeTimer?: ReturnType<typeof setInterval>

  constructor(private readonly selector: string, private readonly inspect: () => void, private readonly url = () => location.href) {}

  buttons() { return [...this.controls].filter(button => button.isConnected && button.matches(this.selector)) }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (this.started) this.route(true)
  }

  schedule(delay = 120) {
    if (!this.enabled || this.disposed || this.suspended || document.hidden || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (this.enabled && !this.disposed && !this.suspended && !document.hidden) this.inspect()
    }, delay)
  }

  private pause() {
    this.observer.disconnect()
    this.controls.clear()
    clearTimeout(this.timer); this.timer = undefined
  }

  private route(force = false) {
    const url = this.url()
    if (!force && url === this.previousUrl) return
    this.previousUrl = url
    this.pause()
    if (!this.enabled || this.disposed || this.suspended || document.hidden) return
    const page = applicationPage(url)
    if (page?.platform !== "wanted" || !page.jobId) return
    if (!page.result && document.documentElement) {
      document.querySelectorAll<HTMLButtonElement>(this.selector).forEach(button => this.controls.add(button))
      this.observer.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden", "disabled", "aria-disabled", "data-attribute-id", "data-position-id", "data-company-name", "data-position-name"]
      })
    }
    this.inspect()
  }

  private changed(mutations: MutationRecord[]) {
    let relevant = false
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
      if (mutation.type === "attributes") {
        if (target instanceof HTMLButtonElement && target.matches(this.selector)) { this.controls.add(target); relevant = true }
        else if (target && [...this.controls].some(button => target.contains(button))) relevant = true
      } else {
        if (target && [...this.controls].some(button => button.contains(target))) relevant = true
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue
          if (node instanceof HTMLButtonElement && node.matches(this.selector)) { this.controls.add(node); relevant = true }
          for (const button of node.querySelectorAll<HTMLButtonElement>(this.selector)) { this.controls.add(button); relevant = true }
        }
      }
    }
    for (const button of this.controls) if (!button.isConnected || !button.matches(this.selector)) { this.controls.delete(button); relevant = true }
    if (relevant) this.schedule()
  }

  start() {
    if (this.started || this.disposed) return
    this.started = true
    const listen = (target: EventTarget, type: string, callback: EventListener) => {
      target.addEventListener(type, callback)
      this.listeners.push(() => target.removeEventListener(type, callback))
    }
    listen(window, "popstate", () => this.route())
    listen(window, "pageshow", event => { if (event.isTrusted) { this.suspended = false; this.route(true) } })
    listen(window, "pagehide", event => {
      if (!event.isTrusted) return
      if ((event as PageTransitionEvent).persisted) { this.suspended = true; this.pause() }
      else this.dispose()
    })
    listen(document, "DOMContentLoaded", () => this.route(true))
    listen(document, "visibilitychange", () => this.route(true))
    this.routeTimer = setInterval(() => { if (!this.suspended && !document.hidden) this.route() }, 1000)
    this.route(true)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.pause(); clearInterval(this.routeTimer)
    for (const remove of this.listeners.splice(0)) remove()
  }
}
