import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PageLifecycle } from "../../src/platforms/page-lifecycle"

let lifecycle: PageLifecycle
let observers: { callback: MutationCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[]
let refresh: ReturnType<typeof vi.fn>, routeChanged: ReturnType<typeof vi.fn>, needsRepair: ReturnType<typeof vi.fn>
let transitions: Map<string, EventListener>
beforeEach(() => {
  vi.useFakeTimers()
  observers = []
  vi.stubGlobal("MutationObserver", class {
    observe = vi.fn()
    disconnect = vi.fn()
    constructor(public callback: MutationCallback) { observers.push(this) }
  })
  refresh = vi.fn(); routeChanged = vi.fn(); needsRepair = vi.fn().mockReturnValue(false)
  transitions = new Map()
  const add = window.addEventListener.bind(window)
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
    if (type === "pagehide" || type === "pageshow") transitions.set(type, listener as EventListener)
    add(type, listener, options)
  })
  lifecycle = new PageLifecycle({ refresh, routeChanged, popState: vi.fn(), needsRepair, discoveryDuration: () => 15000 })
})
afterEach(() => { lifecycle.dispose(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = "" })

function transition(type: string, persisted: boolean) {
  transitions.get(type)!({ isTrusted: true, persisted } as unknown as Event)
}

it("releases every observer, timer and registered subscription exactly once", () => {
  const cleanup = vi.fn()
  lifecycle.addCleanup(cleanup); lifecycle.start(); lifecycle.start()
  document.body.innerHTML = "<main></main>"
  lifecycle.observe(document.querySelector("main"), false)
  lifecycle.waitForHistory(45000); lifecycle.schedule()
  expect(observers).toHaveLength(3)
  lifecycle.dispose(); lifecycle.dispose()
  expect(observers.every(observer => observer.disconnect.mock.calls.length > 0)).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  expect(cleanup).toHaveBeenCalledTimes(1)
  window.dispatchEvent(new Event("online")); vi.advanceTimersByTime(1000)
  expect(refresh).not.toHaveBeenCalled()
})

it("suspends in the back-forward cache and resumes a single observation lifecycle", () => {
  lifecycle.start()
  transition("pagehide", true)
  expect(vi.getTimerCount()).toBe(0)
  lifecycle.start()
  transition("pageshow", true)
  vi.advanceTimersByTime(180)
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(observers).toHaveLength(2)
  lifecycle.dispose()
  window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  expect(vi.getTimerCount()).toBe(0)
})

it("only schedules DOM work when a visible SPA URL changes", () => {
  lifecycle.start(); vi.advanceTimersByTime(1000)
  expect(refresh).not.toHaveBeenCalled()
  history.replaceState(null, "", "/route-for-lifecycle-test")
  vi.advanceTimersByTime(1000)
  expect(routeChanged).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(180)
  expect(refresh).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(1000)
  expect(routeChanged).toHaveBeenCalledTimes(1)
})

it("ignores owned warning mutations unless repair is needed and detaches an obsolete root", () => {
  lifecycle.start()
  document.body.innerHTML = "<main><todaystart-warning></todaystart-warning></main>"
  lifecycle.observe(document.querySelector("main"), false)
  const observer = observers[1]!
  const mutation = { type: "characterData", target: document.querySelector("todaystart-warning") } as unknown as MutationRecord
  observer.callback([mutation], {} as MutationObserver); vi.advanceTimersByTime(180)
  expect(refresh).not.toHaveBeenCalled()
  needsRepair.mockReturnValue(true)
  observer.callback([mutation], {} as MutationObserver); vi.advanceTimersByTime(180)
  expect(refresh).toHaveBeenCalledTimes(1)
  lifecycle.observe(undefined, false)
  expect(observer.disconnect).toHaveBeenCalled()
  expect(observers[2]!.disconnect).not.toHaveBeenCalled()
  expect(observers[0]!.observe).toHaveBeenCalledTimes(2)
  lifecycle.observe(document.querySelector("main"), false)
  expect(observers[2]!.disconnect).toHaveBeenCalled()
})

it("does not let page-dispatched lifecycle events dispose the content script", () => {
  const cleanup = vi.fn()
  lifecycle.addCleanup(cleanup); lifecycle.start()
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }))
  lifecycle.schedule(); vi.advanceTimersByTime(180)
  expect(cleanup).not.toHaveBeenCalled()
  expect(refresh).toHaveBeenCalledTimes(1)
})
