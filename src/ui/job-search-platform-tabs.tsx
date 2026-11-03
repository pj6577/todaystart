import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { platformLabel } from "../core/model"
import type { SearchPlatform, SearchStatus } from "../search/model"
import { PlatformSymbol } from "./platform-logo"
import { Button } from "./primitives/button"

interface Item { platform: SearchPlatform; count: number; status?: SearchStatus | "loading" }
interface Props {
  order: readonly SearchPlatform[]
  items: Item[]
  total: number
  value: SearchPlatform | "all"
  onSelect(platform: SearchPlatform | "all"): void
  onMove(from: SearchPlatform, to: SearchPlatform): void
}
interface Gesture {
  platform: SearchPlatform; pointerId: number; x: number; y: number
  element: HTMLButtonElement; moved: boolean; over?: SearchPlatform
}

export function JobSearchPlatformTabs({ order, items, total, value, onSelect, onMove }: Props) {
  const nav = useRef<HTMLElement>(null), gesture = useRef<Gesture>()
  const latest = useRef({ items, onMove }); latest.current = { items, onMove }
  const suppressClick = useRef(false), focusAfterMove = useRef<SearchPlatform>()
  const [drag, setDrag] = useState<{ platform: SearchPlatform; x: number; y: number; over?: SearchPlatform }>()
  const [announcement, setAnnouncement] = useState("")
  const instructions = useId()
  const visibleKey = items.map(item => item.platform).join(",")
  function hit(x: number, y: number) {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-search-platform]")
    return element && nav.current?.contains(element) ? latest.current.items.find(item => item.platform === element.dataset.searchPlatform)?.platform : undefined
  }
  function finish(cancel = false) {
    const active = gesture.current
    if (!active) return
    gesture.current = undefined
    if (active.element.hasPointerCapture?.(active.pointerId)) active.element.releasePointerCapture(active.pointerId)
    if (active.moved || cancel) suppressClick.current = true
    setDrag(undefined)
    if (!cancel && active.moved && active.over && active.over !== active.platform && latest.current.items.some(item => item.platform === active.platform)) {
      focusAfterMove.current = active.platform
      latest.current.onMove(active.platform, active.over)
      setAnnouncement(`${platformLabel[active.platform]} 순서를 ${latest.current.items.findIndex(item => item.platform === active.over) + 1}번째로 변경했어요.`)
    } else if (active.moved) setAnnouncement("순서 변경을 취소했어요.")
  }
  const finishRef = useRef(finish); finishRef.current = finish
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = gesture.current
      if (!active || event.pointerId !== active.pointerId) return
      const x = event.clientX - active.x, y = event.clientY - active.y
      if (!active.moved && Math.hypot(x, y) < 6) return
      event.preventDefault(); active.moved = true; active.over = hit(event.clientX, event.clientY)
      setDrag({ platform: active.platform, x, y, over: active.over })
    }
    const up = (event: PointerEvent) => {
      const active = gesture.current
      if (!active || event.pointerId !== active.pointerId) return
      if (active.moved) active.over = hit(event.clientX, event.clientY)
      finishRef.current()
    }
    const cancel = (event: PointerEvent) => { if (gesture.current?.pointerId === event.pointerId) finishRef.current(true) }
    const blur = () => finishRef.current(true)
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current) { event.preventDefault(); event.stopImmediatePropagation(); finishRef.current(true) }
    }
    window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", escape, true); window.addEventListener("blur", blur)
    return () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", blur)
      const active = gesture.current; gesture.current = undefined
      if (active?.element.hasPointerCapture?.(active.pointerId)) active.element.releasePointerCapture(active.pointerId)
    }
  }, [])
  // External order/site changes cancel an unfinished gesture instead of committing a stale order.
  useEffect(() => { finishRef.current(true) }, [order, visibleKey])
  useLayoutEffect(() => {
    if (!focusAfterMove.current) return
    nav.current?.querySelector<HTMLButtonElement>(`[data-search-platform="${focusAfterMove.current}"]`)?.focus({ preventScroll: true })
    focusAfterMove.current = undefined
  }, [order])
  function start(event: React.PointerEvent<HTMLButtonElement>, platform: SearchPlatform) {
    if (event.button !== 0 || event.isPrimary === false || gesture.current) return
    suppressClick.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { platform, pointerId: event.pointerId, x: event.clientX, y: event.clientY, element: event.currentTarget, moved: false }
  }

  return <nav className="job-search-filters" ref={nav} aria-label="검색 결과 사이트 필터" onPointerDownCapture={() => { suppressClick.current = false }} onClickCapture={event => {
    if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false }
  }}>
    <Button variant="outline" data-search-platform="all" data-result-count={total} aria-pressed={value === "all"} onClick={() => onSelect("all")}>전체</Button>
    {items.map(item => {
      const dragging = drag?.platform === item.platform
      const target = drag?.over === item.platform && !dragging ? order.indexOf(drag.platform) < order.indexOf(item.platform) ? "after" : "before" : undefined
      return <Button variant="outline" key={item.platform} className={`job-search-platform-tab${dragging ? " is-dragging" : ""}`} data-drop-side={target}
        data-search-platform={item.platform} data-search-status={item.status} data-result-count={item.count} aria-pressed={value === item.platform}
        aria-describedby={instructions} aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" title="끌어서 순서 변경 · Alt+좌우 방향키로 이동"
        style={dragging ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined}
        onPointerDown={event => start(event, item.platform)} onLostPointerCapture={() => { if (gesture.current?.platform === item.platform) finish(true) }}
        onDragStart={event => event.preventDefault()} onClick={() => onSelect(item.platform)} onKeyDown={event => {
          if (gesture.current || !event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return
          event.preventDefault()
          const index = items.findIndex(other => other.platform === item.platform), next = items[index + (event.key === "ArrowLeft" ? -1 : 1)]
          if (!next) return
          focusAfterMove.current = item.platform; onMove(item.platform, next.platform)
          setAnnouncement(`${platformLabel[item.platform]} 순서를 ${items.indexOf(next) + 1}번째로 변경했어요.`)
        }}>
        <svg className="job-search-platform-grip" width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden="true"><circle cx="2" cy="3" r="1" /><circle cx="6" cy="3" r="1" /><circle cx="2" cy="7" r="1" /><circle cx="6" cy="7" r="1" /><circle cx="2" cy="11" r="1" /><circle cx="6" cy="11" r="1" /></svg>
        <PlatformSymbol platform={item.platform} />{platformLabel[item.platform]}
      </Button>
    })}
    <span id={instructions} className="sr-only">플랫폼을 끌거나 Alt와 좌우 방향키로 검색 결과 순서를 바꿀 수 있어요. Esc로 끌기를 취소해요. 전체는 맨 앞에 고정돼요.</span>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </nav>
}
