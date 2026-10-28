import type { CompanyMatch, JobPosting } from "../core/model"
import { sourceLabel, recordDateLabel, recordStatusLabel } from "../core/model"
import { safeJobUrl } from "../core/urls"

const css = `
:host {
  all: initial;
  --warning-bg: #fafafa; --warning-border: #d4d4d8;
  --warning-text: #18181b; --warning-muted: #52525b; --warning-link: #1d4ed8; --warning-scheme: light;
  display: block; margin: 8px 0; font-family: system-ui, -apple-system, sans-serif;
  color: var(--warning-text); font-size: 12px; line-height: 1.65;
}
:host([data-theme=dark]) {
  --warning-bg: #18181b; --warning-border: #3f3f46;
  --warning-text: #fafafa; --warning-muted: #a1a1aa; --warning-link: #93c5fd; --warning-scheme: dark;
}
:host([data-placement=card-top]) { margin: 0; padding: 16px 20px 0; width: 100%; box-sizing: border-box; }
@media (prefers-color-scheme: dark) {
  :host([data-theme=system]) {
    --warning-bg: #18181b; --warning-border: #3f3f46;
    --warning-text: #fafafa; --warning-muted: #a1a1aa; --warning-link: #93c5fd; --warning-scheme: dark;
  }
}
* { -webkit-text-fill-color: currentColor; }
details, summary, article, p { color: var(--warning-text); }
details { border: 1px solid var(--warning-border); border-radius: 6px; background: var(--warning-bg); padding: 9px 12px; color-scheme: var(--warning-scheme); }
summary { cursor: pointer; font-weight: 600; list-style-position: inside; }
article { padding-top: 8px; margin-top: 8px; border-top: 1px solid var(--warning-border); }
p { margin: 3px 0; }
a, a:visited { color: var(--warning-link); text-decoration: underline; }
small { display: block; color: var(--warning-muted); }
`

const hostSelector = 'todaystart-warning[data-todaystart="warning"]'
const containerSelector = `${hostSelector},[data-todaystart-owned="warning-row"],[data-todaystart-owned="warning-item"]`
function warningContainers(element: Element, cardTop: boolean, detail: boolean): HTMLElement[] {
  if (cardTop) return [...element.querySelectorAll<HTMLElement>(`:scope > ${hostSelector}`)]
  const containers: HTMLElement[] = []
  let sibling = detail ? element.nextElementSibling : element.previousElementSibling
  while (sibling?.matches(containerSelector)) {
    containers.push(sibling as HTMLElement)
    sibling = detail ? sibling.nextElementSibling : sibling.previousElementSibling
  }
  return containers
}
function warningHost(container: HTMLElement): HTMLElement | null {
  return container.matches(hostSelector) ? container : container.querySelector<HTMLElement>(hostSelector)
}

export class WarningInjector {
  private theme: "system" | "light" | "dark" = "system"
  setTheme(theme: "system" | "light" | "dark") { this.theme = theme }
  private mounted = new Map<Element, { host: HTMLElement; container: HTMLElement; signature: string; detail: boolean; cardTop: boolean }>()
  clear() { for (const entry of this.mounted.values()) entry.container.remove(); this.mounted.clear() }
  needsRepair() { return [...this.mounted].some(([element, entry]) => element.isConnected && (!entry.host.isConnected || !entry.container.isConnected || warningContainers(element, entry.cardTop, entry.detail).length !== 1 || (entry.cardTop ? element.firstElementChild : entry.detail ? element.nextElementSibling : element.previousElementSibling) !== entry.container)) }
  render(postings: JobPosting[], matches: (posting: JobPosting) => CompanyMatch[], detail: boolean): number {
    const active = new Set<Element>()
    const activeContainers = new Set<HTMLElement>()
    let count = 0
    for (const posting of postings) {
      const element = posting.element
      if (!element?.isConnected || active.has(element)) continue
      const current = this.mounted.get(element)
      const cardTop = !detail && element.matches("div,article,section,li")
      const containers = warningContainers(element, cardTop, detail)
      const found = matches(posting)
      if (!found.length) {
        current?.container.remove()
        for (const container of containers) container.remove()
        this.mounted.delete(element)
        continue
      }
      count++
      active.add(element)
      const signature = JSON.stringify([posting.companyName, detail, this.theme, found.map(m => [m.record, m.confidence])])
      // Reuse the occupied slot on a repeated injection. Removing and replacing
      // another live host would make two controllers continually repair each other.
      const existing = containers.find(container => !!warningHost(container)?.shadowRoot)
      const host = current?.host || (existing && warningHost(existing)) || document.createElement("todaystart-warning")
      let container: HTMLElement = current?.container || existing || host
      for (const orphan of containers) if (orphan !== container) orphan.remove()
      host.setAttribute("data-todaystart", "warning")
      host.setAttribute("data-interactive", "true")
      host.dataset.theme = this.theme
      const shadow = host.shadowRoot || host.attachShadow({ mode: "open" })
      if (current?.signature !== signature || !shadow.querySelector("details")) {
        const wasOpen = current && current.detail !== detail ? undefined : shadow.querySelector("details")?.open
        shadow.replaceChildren()
        // A search card can navigate on any bubbled click. Keep expanding the
        // history and following its native links independent of that handler.
        const style = document.createElement("style")
        style.textContent = css
        shadow.append(style)
        const details = document.createElement("details")
        details.addEventListener("click", event => event.stopPropagation())
        details.addEventListener("keydown", event => event.stopPropagation())
        details.open = wasOpen ?? detail
        const possible = found.every(m => m.confidence === "possible")
        if (possible) details.className = "possible"
        const summary = document.createElement("summary")
        summary.textContent = possible ? "오늘시작 · 동일 기업 가능성 있음" : `오늘시작 · ${[...new Set(found.map(m => sourceLabel(m.record)))].join("·")} 지원 이력 있음`
        details.append(summary)
        for (const { record, confidence } of found) {
          const article = document.createElement("article")
          for (const text of [record.companyName, `${sourceLabel(record)} · ${record.appliedAt || recordDateLabel(record)} · ${recordStatusLabel(record)}`, `지원 직무: ${record.jobTitle}`]) {
            const p = document.createElement("p"); p.textContent = text; article.append(p)
          }
          if (confidence === "possible" || confidence === "probable") {
            const small = document.createElement("small")
            small.textContent = confidence === "possible" ? "이름이 비슷한 기업의 기록이에요. 같은 기업인지 확인해 주세요." : "기업명 표기가 다른 기록이에요. 같은 기업인지 확인해 주세요."
            article.append(small)
          }
          const url = safeJobUrl(record.jobUrl, record.platform)
          if (url) {
            const link = document.createElement("a")
            link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "기존 지원 공고 바로가기 ↗"
            article.append(link)
          }
          details.append(article)
        }
        shadow.append(details)
      }
      // Preserve table/list structure rather than placing a custom element in tbody/ul.
      if (container === host && element instanceof HTMLTableRowElement) {
        const row = document.createElement("tr")
        const cell = document.createElement("td")
        row.setAttribute("data-todaystart-owned", "warning-row")
        cell.colSpan = Array.from(element.cells).reduce((sum, c) => sum + c.colSpan, 0) || 1
        cell.append(host); row.append(cell); container = row
      } else if (container === host && !cardTop && element.parentElement?.matches("ul,ol")) {
        const item = document.createElement("li")
        item.setAttribute("data-todaystart-owned", "warning-item")
        item.style.listStyle = "none"
        item.append(host); container = item
      }
      if (cardTop) {
        host.dataset.placement = "card-top"
        if (element.firstElementChild !== container) element.prepend(container)
      } else {
        delete host.dataset.placement
        if (!detail && element.previousElementSibling !== container) element.before(container)
        else if (detail && element.nextElementSibling !== container) element.after(container)
      }
      activeContainers.add(container)
      this.mounted.set(element, { host, container, signature, detail, cardTop })
    }
    for (const [el, entry] of this.mounted) if (!active.has(el) || !el.isConnected) { if (!activeContainers.has(entry.container)) entry.container.remove(); this.mounted.delete(el) }
    return count
  }
}
