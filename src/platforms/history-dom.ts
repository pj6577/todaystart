// Read visible application text only; controls and injected extension UI are
// not application evidence (for example, a cancel button is not cancellation).
export function historyText(element: Element): string {
  if (element.matches("script,style,input,select,textarea,button,nav,header,footer,[hidden],[aria-hidden=true],todaystart-warning,todaystart-collection")) return ""
  if (element instanceof HTMLElement) {
    if (element.style.display === "none" || element.style.visibility === "hidden") return ""
    if (element.ownerDocument.defaultView && element.isConnected) {
      const style = element.ownerDocument.defaultView.getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden") return ""
    }
  }
  return Array.from(element.childNodes).map(node => node.nodeType === Node.TEXT_NODE ? node.textContent : node instanceof Element ? historyText(node) : "").join(" ").replace(/\s+/g, " ").trim()
}

export function visibleHistoryRow(row: Element): boolean {
  for (let ancestor: Element | null = row; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.matches("[hidden],[aria-hidden=true]")) return false
    const style = ancestor.ownerDocument.defaultView?.getComputedStyle(ancestor)
    if (style?.display === "none" || style?.visibility === "hidden" || (ancestor instanceof HTMLElement && ancestor.style.display === "none")) return false
  }
  return true
}
