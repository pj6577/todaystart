// These combined attributes/text were supplied from the actual Jobkorea
// before/after UI. Layout classes are not evidence and may change between views.
// A generic tracking attribute or disabled submit is not proof.
export function hasJobkoreaCompletion(doc: Document, root: ParentNode = doc): boolean {
  return jobkoreaAdditionalControls(doc, root).some(control => control.dataset.applymode === "ONLINE" && control.dataset.activity === "APPLY_COMPLETE")
}

// The user confirmed that the actual OnPass submit changes to 추가지원.
// Count that transition only after a trusted final click in this document;
// a pre-existing additional-apply button cannot establish a new completion.
export function hasJobkoreaCompletionTransition(doc: Document, beforeClick: ReadonlySet<Element>): boolean {
  return jobkoreaAdditionalControls(doc).some(control => !beforeClick.has(control))
}

export function jobkoreaAdditionalControls(doc: Document, root: ParentNode = doc): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button,input[type="button"],input[type="submit"],a[role="button"],[role="button"][data-activity="APPLY_COMPLETE"]')].filter(control => {
    const label = control instanceof HTMLInputElement ? control.value : control.textContent?.trim() || control.getAttribute("aria-label") || ""
    return label.replace(/\s+/g, "") === "추가지원" && visible(doc, control)
  })
}

// Only used on a verified OnPassResult URL with its public posting ID.
// Do not treat generic success text, instructions, or hidden templates as evidence.
export function hasJobkoreaResultHeading(doc: Document): boolean {
  return [...doc.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,[role="heading"],[role="status"],[role="alert"]')].some(element =>
    /^입사지원(?:이)?(?:정상적으로)?완료(?:되었습니다|됐습니다)?[.!！。]?$/.test((element.textContent || "").replace(/\s+/g, "")) && visible(doc, element))
}

function visible(doc: Document, control: Element): boolean {
  if (control.closest('[hidden],[inert],[aria-hidden="true"]')) return false
  const view = doc.defaultView
  if (!view || control.getClientRects().length === 0) return false
  for (let element: Element | null = control; element; element = element.parentElement) {
    const style = view.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return false
  }
  return true
}
