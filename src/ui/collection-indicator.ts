import { sentenceLines } from "./sentences"

export interface CollectionIndicatorState {
  id: string
  status: "running" | "completed" | "stopped" | "error"
  title: string
  message: string
  detail?: string
  stoppable?: boolean
  retryable?: boolean
}

const css = `
:host { all: initial; position: fixed; right: 24px; bottom: 24px; width: 352px; max-width: calc(100vw - 32px); z-index: 2147483646; font: 13px/1.6 system-ui, -apple-system, sans-serif; color: #18181b; --bg: #fff; --text: #18181b; --muted: #52525b; --border: #d4d4d8; }
:host([data-theme=dark]) { --bg: #18181b; --text: #fafafa; --muted: #a1a1aa; --border: #3f3f46; }
@media (prefers-color-scheme: dark) { :host([data-theme=system]) { --bg: #18181b; --text: #fafafa; --muted: #a1a1aa; --border: #3f3f46; } }
section { color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 32px #0002; padding: 16px; }
header { display: flex; align-items: center; gap: 8px; } strong { flex: 1; font-size: 13px; } small { display: block; color: var(--muted); font-size: 11px; margin-bottom: 8px; }
p { margin: 10px 0 0; overflow-wrap: anywhere; white-space: pre-line; } .detail { color: var(--muted); font-size: 12px; margin-top: 5px; }
footer { display: flex; gap: 8px; margin-top: 14px; } button { font: inherit; cursor: pointer; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); padding: 7px 10px; } .primary { background: #1d4ed8; color: #fff; border-color: transparent; } .close { border: 0; padding: 0 5px; font-size: 18px; } button:focus-visible { outline: 2px solid var(--muted); outline-offset: 3px; }
.mark { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--text); border-radius: 50%; animation: spin 1s linear infinite; flex: none; } .done { width: 18px; text-align: center; font-size: 16px; } @keyframes spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { .mark { animation: none; } }
`

export class CollectionIndicator {
  private host?: HTMLElement
  private signature = ""
  private dismissed = ""
  constructor(private actions: { dashboard: () => void; stop: () => void; retry: () => void }) {}
  clear() { this.host?.remove(); this.host = undefined; this.signature = "" }
  render(state: CollectionIndicatorState | undefined, theme: "system" | "light" | "dark") {
    if (!state || this.dismissed === state.id + state.status) { this.clear(); return }
    const signature = JSON.stringify([state, theme])
    if (signature === this.signature && this.host?.isConnected) return
    this.signature = signature
    if (!this.host?.isConnected) {
      this.host = document.createElement("todaystart-collection")
      this.host.setAttribute("data-todaystart-owned", "collection-status")
      this.host.attachShadow({ mode: "open" })
      document.documentElement.append(this.host)
    }
    this.host.dataset.theme = theme
    const shadow = this.host.shadowRoot!
    const style = document.createElement("style"); style.textContent = css
    const section = document.createElement("section")
    section.setAttribute("role", "status"); section.setAttribute("aria-live", "polite"); section.setAttribute("aria-label", "오늘시작 수집 상태")
    const brand = document.createElement("small"); brand.textContent = "오늘시작 · 지원 기록"
    const header = document.createElement("header")
    const mark = document.createElement("span"); mark.setAttribute("aria-hidden", "true"); mark.className = state.status === "running" ? "mark" : "done"; mark.textContent = state.status === "completed" ? "✓" : state.status === "running" ? "" : "!"
    const title = document.createElement("strong"); title.textContent = state.title
    const close = document.createElement("button"); close.className = "close"; close.textContent = "×"; close.setAttribute("aria-label", "수집 안내 닫기"); close.onclick = () => { this.dismissed = state.id + state.status; this.clear() }
    header.append(mark, title, close)
    const message = document.createElement("p"); message.textContent = sentenceLines(state.message)
    section.append(brand, header, message)
    if (state.detail) { const detail = document.createElement("p"); detail.className = "detail"; detail.textContent = sentenceLines(state.detail); section.append(detail) }
    const footer = document.createElement("footer")
    const button = (text: string, action: () => void, primary = false) => { const el = document.createElement("button"); el.textContent = text; if (primary) el.className = "primary"; el.onclick = action; footer.append(el) }
    button("대시보드 열기", this.actions.dashboard, true)
    if (state.stoppable) button("수집 중지", this.actions.stop)
    if (state.retryable) button("다시 시도", this.actions.retry)
    section.append(footer); shadow.replaceChildren(style, section)
  }
}
