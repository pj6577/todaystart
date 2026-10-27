// This is only used inside a verified OnPass document, never on a posting's
// first-step button. A click starts observation; it is not proof of success.
export function isJobkoreaApplyClick(target: Element): boolean {
  const control = target.closest<HTMLElement>('button,input[type="submit"],input[type="button"],a[href],[role="button"]')
  if (!control || control.matches(":disabled") || control.closest('[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"]')) return false
  const label = (control instanceof HTMLInputElement ? control.value : control.textContent || control.getAttribute("aria-label") || "").replace(/\s+/g, "")
  if (!["지원하기", "입사지원", "입사지원하기", "즉시지원"].includes(label)) return false
  const view = control.ownerDocument.defaultView
  if (!view || !control.getClientRects().length) return false
  for (let element: Element | null = control; element; element = element.parentElement) {
    const style = view.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return false
  }
  return true
}
