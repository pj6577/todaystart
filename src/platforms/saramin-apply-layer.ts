const selector = "#iframe_layer, #wrap_quick_apply_layer"
const contentSelector = "#iframe_layer, #wrap_quick_apply_layer #quick_apply_layer_frame"

// Saramin positions its legacy application layer at the current scroll offset.
// Adding/removing history above that offset triggers browser scroll anchoring,
// moving the absolute layer and its close button offscreen. Keep our posting UI
// unchanged until the native layer closes; do not rewrite the site's layout.
export class SaraminApplyLayer {
  private treeObserver?: MutationObserver
  private visibilityObserver?: MutationObserver
  private open = false

  constructor(private readonly changed: () => void) {}

  isOpen() {
    return [...document.querySelectorAll(contentSelector)].some(layer => {
      for (let element: Element | null = layer; element; element = element.parentElement) {
        const style = getComputedStyle(element)
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false
      }
      return true
    })
  }

  start() {
    if (this.treeObserver) return
    this.visibilityObserver = new MutationObserver(() => this.update())
    this.treeObserver = new MutationObserver(mutations => {
      // Application layers may be mounted/replaced after the initial page load.
      // Ignore changes inside job content and our own history notices.
      if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
        node instanceof Element && (node.matches(`${selector}, #quick_apply_layer_frame`) || !!node.querySelector(`${selector}, #quick_apply_layer_frame`))))) this.watchLayers()
    })
    this.treeObserver.observe(document.documentElement, { childList: true, subtree: true })
    this.watchLayers()
  }

  private watchLayers() {
    this.visibilityObserver?.disconnect()
    const ancestors = new Set<Element>()
    for (const layer of document.querySelectorAll(`${selector}, #quick_apply_layer_frame`)) {
      for (let element: Element | null = layer; element; element = element.parentElement) ancestors.add(element)
    }
    for (const element of ancestors) this.visibilityObserver?.observe(element, { attributes: true, attributeFilter: ["style", "class", "hidden"] })
    this.update()
  }

  private update() {
    const open = this.isOpen()
    if (open === this.open) return
    this.open = open
    this.changed()
  }

  dispose() {
    this.treeObserver?.disconnect()
    this.visibilityObserver?.disconnect()
    this.treeObserver = undefined
    this.visibilityObserver = undefined
  }
}
