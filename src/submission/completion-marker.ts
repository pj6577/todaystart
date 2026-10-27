// These combined attributes/text were supplied from the actual Jobkorea
// before/after UI. Layout classes are not evidence and may change between views.
// A generic tracking attribute or disabled submit is not proof.
export function hasJobkoreaCompletion(doc: Document, root: ParentNode = doc): boolean {
  return jobkoreaAdditionalButtons(doc, root).some(button => button.dataset.applymode === "ONLINE" && button.dataset.activity === "APPLY_COMPLETE")
}

// The user confirmed that the actual OnPass submit changes to 추가지원.
// Count that transition only after a trusted final click in this document;
// a pre-existing additional-apply button cannot establish a new completion.
export function hasJobkoreaCompletionTransition(doc: Document, beforeClick: ReadonlySet<Element>): boolean {
  return jobkoreaAdditionalButtons(doc).some(button => !beforeClick.has(button))
}

function jobkoreaAdditionalButtons(doc: Document, root: ParentNode = doc): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].filter(button => {
    if (button.textContent?.replace(/\s+/g, "").trim() !== "추가지원" || button.closest('[hidden],[aria-hidden="true"]')) return false
    const view = doc.defaultView
    if (!view || button.getClientRects().length === 0) return false
    for (let element: Element | null = button; element; element = element.parentElement) {
      const style = view.getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return false
    }
    return true
  })
}
