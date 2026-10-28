import { afterEach, expect, it, vi } from "vitest"
import { SaraminApplyLayer } from "../../src/platforms/saramin-apply-layer"

let layer: SaraminApplyLayer | undefined
afterEach(() => { layer?.dispose(); layer = undefined; document.body.innerHTML = "" })
const flushed = () => new Promise(resolve => setTimeout(resolve, 0))

it("tracks native open/close without modifying the site's DOM or styles", async () => {
  document.body.innerHTML = '<div id="iframe_layer" style="display:none;top:900px;height:943px"><button>close</button></div>'
  const changed = vi.fn()
  layer = new SaraminApplyLayer(changed); layer.start()
  expect(layer.isOpen()).toBe(false)
  const native = document.getElementById("iframe_layer")!
  native.style.display = "block"
  const before = document.body.innerHTML
  await flushed()
  expect(layer.isOpen()).toBe(true)
  expect(changed).toHaveBeenCalledTimes(1)
  expect(document.body.innerHTML).toBe(before)
  native.style.display = "none"; await flushed()
  expect(layer.isOpen()).toBe(false)
  expect(changed).toHaveBeenCalledTimes(2)
})

it("observes dynamically mounted/replaced layers and ancestor visibility", async () => {
  const changed = vi.fn()
  layer = new SaraminApplyLayer(changed); layer.start()
  document.body.innerHTML = '<section style="display:none"><div id="iframe_layer"></div></section>'
  await flushed()
  expect(changed).not.toHaveBeenCalled()
  document.querySelector("section")!.style.display = "block"; await flushed()
  expect(layer.isOpen()).toBe(true)
  expect(changed).toHaveBeenCalledTimes(1)
  document.querySelector("section")!.outerHTML = '<div id="iframe_layer" hidden></div>'
  await flushed()
  expect(layer.isOpen()).toBe(false)
  expect(changed).toHaveBeenCalledTimes(2)
  document.getElementById("iframe_layer")!.removeAttribute("hidden"); await flushed()
  expect(changed).toHaveBeenCalledTimes(3)
  document.getElementById("iframe_layer")!.remove(); await flushed()
  expect(layer.isOpen()).toBe(false)
  expect(changed).toHaveBeenCalledTimes(4)
})

it("waits for both application layers to close and ignores an empty hidden drawer", async () => {
  document.body.innerHTML = '<div id="iframe_layer"></div><div id="wrap_quick_apply_layer"><iframe id="quick_apply_layer_frame" style="display:none"></iframe></div>'
  const changed = vi.fn()
  layer = new SaraminApplyLayer(changed); layer.start(); changed.mockClear()
  document.getElementById("iframe_layer")!.style.display = "none"; await flushed()
  expect(layer.isOpen()).toBe(false)
  expect(changed).toHaveBeenCalledTimes(1)
  document.getElementById("quick_apply_layer_frame")!.style.display = "block"; await flushed()
  expect(layer.isOpen()).toBe(true)
  document.getElementById("iframe_layer")!.style.display = "block"; await flushed()
  expect(changed).toHaveBeenCalledTimes(2)
  document.getElementById("wrap_quick_apply_layer")!.style.visibility = "hidden"; await flushed()
  expect(layer.isOpen()).toBe(true)
  expect(changed).toHaveBeenCalledTimes(2)
})

it("ignores unrelated mutations and releases observation on disposal", async () => {
  document.body.innerHTML = '<div id="iframe_layer" style="display:none"></div><article></article>'
  const changed = vi.fn()
  layer = new SaraminApplyLayer(changed); layer.start(); layer.start()
  document.querySelector("article")!.innerHTML = '<p style="display:block">job</p>'
  await flushed()
  expect(changed).not.toHaveBeenCalled()
  layer.dispose(); layer.dispose()
  document.getElementById("iframe_layer")!.style.display = "block"; await flushed()
  expect(changed).not.toHaveBeenCalled()
})
