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

export class WarningInjector {
  private theme: "system" | "light" | "dark" = "system"
  setTheme(theme: "system" | "light" | "dark") { this.theme = theme }
  private mounted = new Map<Element, { host: HTMLElement; container: HTMLElement; signature: string }>()
  clear() { for (const entry of this.mounted.values()) entry.container.remove(); this.mounted.clear() }
  needsRepair() { return [...this.mounted].some(([element, entry]) => element.isConnected && (!entry.host.isConnected || !entry.container.isConnected)) }
  render(postings: JobPosting[], matches: (posting: JobPosting) => CompanyMatch[], detail: boolean): number {
    const active = new Set<Element>()
    let count = 0
    for (const posting of postings) {
      const element = posting.element
      if (!element?.isConnected) continue
      const found = matches(posting)
      if (!found.length) continue
      count++
      active.add(element)
      const signature = JSON.stringify([posting.companyName, detail, this.theme, found.map(m => [m.record, m.confidence])])
      const current = this.mounted.get(element)
      const cardTop = !detail && element.matches("div,article,section,li")
      // A site's cloneNode(true) can copy the host without its shadow root.
      // Remove those unowned copies before mounting this card's own history.
      if (cardTop) for (const orphan of element.querySelectorAll(':scope > todaystart-warning[data-todaystart="warning"]')) {
        if (orphan !== current?.host) orphan.remove()
      }
      if (current?.signature === signature && current.host.isConnected) continue
      current?.container.remove()
      const host = document.createElement("todaystart-warning")
      host.setAttribute("data-todaystart", "warning")
      host.setAttribute("data-interactive", "true")
      host.dataset.theme = this.theme
      const shadow = host.attachShadow({ mode: "open" })
      // A search card can navigate on any bubbled click. Keep expanding the
      // history and following its native links independent of that handler.
      shadow.addEventListener("click", event => event.stopPropagation())
      shadow.addEventListener("keydown", event => event.stopPropagation())
      const style = document.createElement("style")
      style.textContent = css
      shadow.append(style)
      const details = document.createElement("details")
      details.open = detail
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
      // Preserve table/list structure rather than placing a custom element in tbody/ul.
      let container: HTMLElement = host
      if (element instanceof HTMLTableRowElement) {
        const row = document.createElement("tr")
        const cell = document.createElement("td")
        row.setAttribute("data-todaystart-owned", "warning-row")
        cell.colSpan = Array.from(element.cells).reduce((sum, c) => sum + c.colSpan, 0) || 1
        cell.append(host); row.append(cell); container = row
      } else if (!cardTop && element.parentElement?.matches("ul,ol")) {
        const item = document.createElement("li")
        item.setAttribute("data-todaystart-owned", "warning-item")
        item.style.listStyle = "none"
        item.append(host); container = item
      }
      if (cardTop) {
        host.dataset.placement = "card-top"
        element.prepend(container)
      } else if (!detail) element.before(container)
      else element.after(container)
      this.mounted.set(element, { host, container, signature })
    }
    for (const [el, entry] of this.mounted) if (!active.has(el) || !el.isConnected) { entry.container.remove(); this.mounted.delete(el) }
    return count
  }
}
