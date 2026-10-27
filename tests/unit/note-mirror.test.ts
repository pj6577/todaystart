import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { NoteMentionInput } from "../../src/ui/note-mentions"

it("defers mirror layout writes outside resize delivery, coalesces notifications and cancels on unmount", () => {
  let notify!: () => void
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  const disconnect = vi.fn()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { notify = callback }
    observe() {}
    disconnect = disconnect
  })
  const schedule = vi.fn((callback: FrameRequestCallback) => { callbacks.set(++nextFrame, callback); return nextFrame })
  const cancel = vi.fn((id: number) => { callbacks.delete(id) })
  vi.stubGlobal("requestAnimationFrame", schedule)
  vi.stubGlobal("cancelAnimationFrame", cancel)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  let unmounted = false
  try {
    act(() => root.render(React.createElement(NoteMentionInput, { body: "긴 메모", records: [], links: [], onChange: () => {} })))
    const field = container.querySelector("textarea")!, mirror = container.querySelector<HTMLElement>(".note-mention-backdrop")!
    Object.defineProperty(field, "clientWidth", { configurable: true, value: 280 })
    field.scrollTop = 120
    notify(); notify(); notify()
    expect(schedule).toHaveBeenCalledTimes(1)
    expect(mirror.style.width).toBe("0px") // No writes during ResizeObserver delivery.
    expect(mirror.scrollTop).toBe(0)
    const [id, callback] = [...callbacks][0]!
    callbacks.delete(id); callback(0)
    expect(mirror.style.width).toBe("280px")
    expect(mirror.scrollTop).toBe(120)
    Object.defineProperty(field, "clientWidth", { configurable: true, value: 400 })
    notify()
    expect(callbacks.size).toBe(1)
    act(() => root.unmount()); unmounted = true
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith(nextFrame)
    expect(callbacks.size).toBe(0)
    expect(mirror.style.width).toBe("280px")
  } finally {
    if (!unmounted) act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
