interface PageLifecycleOptions {
  refresh(): void
  routeChanged(): void
  popState(): void
  discoveryDuration(): number
  needsRepair(): boolean
}

// One owner for DOM observers, scheduled scans and navigation subscriptions.
export class PageLifecycle {
  private active = false
  private started = false
  private disposed = false
  private root?: Element
  private observer?: MutationObserver
  private parentObserver?: MutationObserver
  private discovery?: MutationObserver
  private debounce?: ReturnType<typeof setTimeout>
  private discoveryTimer?: ReturnType<typeof setTimeout>
  private readinessTimer?: ReturnType<typeof setTimeout>
  private routeTimer?: ReturnType<typeof setInterval>
  private previousUrl = location.href
  private readonly cleanups: (() => void)[] = []

  constructor(private readonly options: PageLifecycleOptions) {}

  schedule = () => {
    if (!this.active) return
    clearTimeout(this.debounce)
    this.debounce = setTimeout(() => this.options.refresh(), 180)
  }

  addCleanup(cleanup: () => void) { this.cleanups.push(cleanup) }

  private listen(target: EventTarget, type: string, listener: EventListener) {
    target.addEventListener(type, listener)
    this.addCleanup(() => target.removeEventListener(type, listener))
  }

  start() {
    if (this.disposed || this.started) return
    this.started = true
    this.listen(window, "popstate", () => { this.options.popState(); this.schedule() })
    for (const type of ["hashchange", "online"]) this.listen(window, type, this.schedule)
    this.listen(window, "pageshow", event => { if (event.isTrusted) { this.resume(); this.schedule() } })
    this.listen(window, "pagehide", event => {
      if (!event.isTrusted) return
      if ((event as PageTransitionEvent).persisted) this.suspend()
      else this.dispose()
    })
    this.listen(document, "visibilitychange", () => { if (!document.hidden) this.schedule() })
    this.resume()
  }

  private resume() {
    if (this.active || this.disposed) return
    this.active = true
    this.discovery = new MutationObserver(this.schedule)
    this.beginDiscovery(this.options.discoveryDuration())
    this.routeTimer = setInterval(() => {
      if (!document.hidden && this.previousUrl !== location.href) {
        this.previousUrl = location.href
        this.options.routeChanged()
        this.beginDiscovery(this.options.discoveryDuration())
        this.schedule()
      }
    }, 1000)
  }

  beginDiscovery(duration: number) {
    if (!this.active) return
    this.discovery?.observe(document.documentElement, { childList: true, subtree: true })
    clearTimeout(this.discoveryTimer)
    this.discoveryTimer = setTimeout(() => this.discovery?.disconnect(), duration)
  }

  waitForHistory(duration: number) {
    clearTimeout(this.readinessTimer)
    if (this.active) this.readinessTimer = setTimeout(() => this.options.refresh(), duration)
  }

  observe(root: Element | undefined | null, loading: boolean) {
    if (!this.active) return
    if (root !== this.root) {
      const previousRoot = this.root
      this.observer?.disconnect()
      this.root = root || undefined
      if (root) {
        this.parentObserver?.disconnect()
        this.observer = new MutationObserver(mutations => {
          const ownedOnly = mutations.every(m => (m.target instanceof Element && m.target.closest("todaystart-warning,todaystart-collection")) ||
            (m.type === "childList" && [...m.addedNodes, ...m.removedNodes].every(n => n instanceof Element && (n.tagName === "TODAYSTART-WARNING" || n.hasAttribute("data-todaystart-owned")))))
          if (!ownedOnly || this.options.needsRepair()) this.schedule()
        })
        this.observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true })
        if (root.parentElement) {
          this.parentObserver = new MutationObserver(this.schedule)
          this.parentObserver.observe(root.parentElement, { childList: true })
        }
      } else if (previousRoot) {
        // Keep watching the stable parent during asynchronous replacement;
        // also search briefly in case the parent itself was replaced.
        this.beginDiscovery(this.options.discoveryDuration())
      }
    }
    if (root && !loading) this.discovery?.disconnect()
  }

  private suspend() {
    this.active = false
    this.observer?.disconnect(); this.parentObserver?.disconnect(); this.discovery?.disconnect()
    this.root = undefined
    clearTimeout(this.debounce); clearTimeout(this.discoveryTimer); clearTimeout(this.readinessTimer)
    clearInterval(this.routeTimer)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.suspend()
    for (const cleanup of this.cleanups.splice(0)) cleanup()
  }
}
