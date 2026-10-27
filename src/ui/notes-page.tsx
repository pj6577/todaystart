import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { ApplicationRecord } from "../core/model"
import type { PlannerSnapshot, Note } from "../core/planner"
import { clampNoteSize, defaultNoteSize, emptyNoteBoard, moveNote, orderedNoteIds, type NoteBoard, type NoteLayoutChange, type NoteSize } from "../core/note-board"
import { rpc } from "../messaging/protocol"
import { Icon, Notice } from "./components"
import { linkedRecordMap } from "../core/planner-lookups"
import { noteLinkIds } from "../core/note-mentions"
import { MentionText } from "./note-mentions"

export interface NoteBoardControls { dragHandle: ReactNode; onResize?: (size: NoteSize) => void; onMove: (direction: -1 | 1) => void; canMoveUp: boolean; canMoveDown: boolean }
type Gesture = { kind: "move" | "resize"; id: string; x: number; y: number; width: number; height: number; moved: boolean }
export function NotesPage({ planner, records, onOpen, onNew, renderEditor, editingId, generation }: { planner: PlannerSnapshot; records: ApplicationRecord[]; onOpen: (note: Note, menu?: boolean) => void; onNew: () => void; renderEditor?: (controls: NoteBoardControls) => ReactNode; editingId?: string; generation?: string }) {
  const [query, setQuery] = useState(""), [scope, setScope] = useState("all"), [layout, setLayout] = useState<NoteBoard>(planner.board || emptyNoteBoard()), [previewOrder, setPreviewOrder] = useState<string[]>(), [previewSize, setPreviewSize] = useState<{ id: string; size: NoteSize }>(), [dragging, setDragging] = useState<string>(), [ghost, setGhost] = useState<{ x: number; y: number }>(), [announcement, setAnnouncement] = useState(""), [error, setError] = useState("")
  const board = useRef<HTMLDivElement>(null), gesture = useRef<Gesture>(), orderRef = useRef<string[]>([]), layoutRef = useRef(layout), plannerRef = useRef(planner), pending = useRef(0), commitRef = useRef<(change: NoteLayoutChange) => void>(), originalSelection = useRef("")
  plannerRef.current = planner; layoutRef.current = layout
  useEffect(() => { if (!gesture.current && !pending.current && planner.board && planner.board.revision >= layoutRef.current.revision) { layoutRef.current = planner.board; setLayout(planner.board) } }, [planner.board])
  const baseOrder = useMemo(() => orderedNoteIds(planner.notes, layout), [planner.notes, layout]), fullOrder = previewOrder || baseOrder
  orderRef.current = fullOrder
  const noteMap = useMemo(() => new Map(planner.notes.map(note => [note.id, note])), [planner.notes])
  const recordMap = useMemo(() => linkedRecordMap(records, planner.links), [records, planner.links])
  const visible = fullOrder.filter(id => {
    if (id === editingId) return true
    const note = noteMap.get(id); if (!note) return false
    return (scope === "all" || (scope === "linked" ? noteLinkIds(note).length > 0 : noteLinkIds(note).length === 0)) && (!query || [note.title, note.body, ...noteLinkIds(note).map(id => recordMap.get(id)?.companyName || "")].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  })
  if (editingId && !visible.includes(editingId)) visible.unshift(editingId)
  function announce(id: string, order = orderRef.current) { setAnnouncement(`${noteMap.get(id)?.title || "메모"}, ${order.indexOf(id) + 1}번째 위치`) }
  async function commit(change: NoteLayoutChange) {
    pending.current++; setError("")
    const current = layoutRef.current, optimistic = { ...current, order: orderedNoteIds(plannerRef.current.notes, current), sizes: { ...current.sizes } }
    if (change.kind === "move") optimistic.order = moveNote(optimistic.order, change.id, change.beforeId)
    else optimistic.sizes[change.id] = change.size
    layoutRef.current = optimistic; setLayout(optimistic)
    try {
      const saved = await rpc({ type: "note_layout", change, dataGeneration: generation })
      if (pending.current === 1) { layoutRef.current = saved; setLayout(saved) }
    } catch (error) { setError(error instanceof Error ? error.message : "메모 배치를 저장하지 못했어요."); const latest = plannerRef.current.board || emptyNoteBoard(); layoutRef.current = latest; setLayout(latest) }
    finally { pending.current-- }
  }
  commitRef.current = change => void commit(change)
  function finish(cancel = false) {
    const active = gesture.current; if (!active) return
    gesture.current = undefined; document.body.style.userSelect = originalSelection.current
    if (!cancel && active.moved) {
      if (active.kind === "move") { const index = orderRef.current.indexOf(active.id); commitRef.current?.({ kind: "move", id: active.id, beforeId: orderRef.current[index + 1] }); announce(active.id) }
      else commitRef.current?.({ kind: "resize", id: active.id, size: clampNoteSize(active.width, active.height) })
    }
    setDragging(undefined); setGhost(undefined); setPreviewOrder(undefined); setPreviewSize(undefined)
    if (cancel) setAnnouncement("배치 변경을 취소했어요.")
  }
  const finishRef = useRef(finish); finishRef.current = finish
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = gesture.current; if (!active) return
      if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 6) return
      active.moved = true; event.preventDefault()
      if (active.kind === "resize") {
        const maxWidth = board.current?.clientWidth || 720, size = clampNoteSize(Math.min(maxWidth, active.width + event.clientX - active.x), active.height + event.clientY - active.y)
        setPreviewSize({ id: active.id, size }); return
      }
      setGhost({ x: event.clientX + 12, y: event.clientY + 12 })
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-note-id]")
      const targetId = target?.dataset.noteId
      if (target && board.current?.contains(target) && targetId && targetId !== active.id) {
        const rect = target.getBoundingClientRect(), remaining = orderRef.current.filter(id => id !== active.id), at = remaining.indexOf(targetId), after = event.clientX > rect.left + rect.width / 2 || event.clientY > rect.bottom - 24
        const next = moveNote(orderRef.current, active.id, remaining[at + (after ? 1 : 0)])
        orderRef.current = next; setPreviewOrder(next)
      }
      if (event.clientY < 64) window.scrollBy(0, -16)
      else if (event.clientY > innerHeight - 64) window.scrollBy(0, 16)
    }
    const up = (event: PointerEvent) => {
      const active = gesture.current
      if (active?.kind === "resize" && active.moved) { const size = clampNoteSize(Math.min(board.current?.clientWidth || 720, active.width + event.clientX - active.x), active.height + event.clientY - active.y); active.width = size.width; active.height = size.height }
      finishRef.current()
    }
    const cancel = () => finishRef.current(true), escape = (event: KeyboardEvent) => { if (event.key === "Escape" && gesture.current) { event.preventDefault(); event.stopImmediatePropagation(); cancel() } }
    window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", escape, true)
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", escape, true); if (gesture.current) document.body.style.userSelect = originalSelection.current }
  }, [])
  function start(event: React.PointerEvent<HTMLButtonElement>, id: string, kind: Gesture["kind"]) {
    if (event.button !== 0 || !noteMap.has(id)) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.closest<HTMLElement>("[data-note-id]")!.getBoundingClientRect()
    gesture.current = { kind, id, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, moved: false }
    originalSelection.current = document.body.style.userSelect; document.body.style.userSelect = "none"
    if (kind === "move") { setDragging(id); setPreviewOrder([...orderRef.current]); setAnnouncement("끌어서 위치를 바꾸세요. Esc로 취소할 수 있어요.") }
  }
  function shift(id: string, direction: -1 | 1) {
    const order = orderRef.current, index = order.indexOf(id), nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= order.length) return
    const beforeId = direction < 0 ? order[nextIndex] : order[nextIndex + 1]
    const next = moveNote(order, id, beforeId); orderRef.current = next
    void commit({ kind: "move", id, beforeId }); announce(id, next)
  }
  return <section className="notes-page" aria-label="메모 목록"><div className="planner-toolbar"><div className="planner-tabs" role="group" aria-label="메모 구분">{[["all", "전체"], ["linked", "지원 메모"], ["general", "일반 메모"]].map(([id, label]) => <button key={id} aria-pressed={scope === id} onClick={() => setScope(id!)}>{label}</button>)}</div><label className="search-box"><Icon name="search" size={16} /><input aria-label="메모 검색" placeholder="제목, 내용, 기업 검색" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    <div className="note-board-caption"><span>{planner.notes.length}개의 메모</span><span>상단 손잡이로 순서 이동 · 모서리로 크기 조절</span></div>
    {error && <Notice error>{error}</Notice>}<span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    <div ref={board} className="notes-grid notes-board">{visible.map(id => {
      const note = noteMap.get(id), size = previewSize?.id === id ? previewSize.size : layout.sizes[id] || defaultNoteSize, index = fullOrder.indexOf(id)
      const dragHandle = <button type="button" className="note-drag-handle" data-note-board-control aria-label={`${note?.title || "새 메모"} 순서 이동`} title="끌어서 이동 · 방향키로 한 칸 이동" disabled={!note} onPointerDown={event => start(event, id, "move")} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); shift(id, event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) } }}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6h8M4 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button>
      const controls: NoteBoardControls = { dragHandle, onResize: note ? size => void commit({ kind: "resize", id, size }) : undefined, onMove: direction => shift(id, direction), canMoveUp: !!note && index > 0, canMoveDown: !!note && index < fullOrder.length - 1 }
      return <div key={id} className={`note-frame${id === dragging ? " is-dragging" : ""}${id === editingId ? " is-editing" : ""}`} data-note-id={id} data-note-color={note?.color || "yellow"} style={{ width: size.width, height: size.height }}>
        {id === editingId && renderEditor ? renderEditor(controls) : note && <><header className="note-card-toolbar">{dragHandle}<span>{note.pinned ? "고정한 메모" : "메모"}</span><button type="button" className="icon-btn" aria-label={`${note.title} 메뉴`} data-note-board-control onClick={() => onOpen(note, true)}><Icon name="more" size={17} /></button></header><button type="button" className="note-card" data-note-color={note.color || "yellow"} onClick={() => onOpen(note)}><div className="note-card-top"><span>{[...new Set(noteLinkIds(note).map(link => recordMap.get(link)?.companyName).filter(Boolean))].map(name => `@${name}`).join(" · ") || "나의 메모"}</span></div><h2>{note.title}</h2><p><MentionText body={note.body || "내용을 적어 보세요."} mentions={note.mentions} /></p><div className="note-card-bottom"><time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" })}</time>{note.checklist.length > 0 && <span>할 일 {note.checklist.filter(item => item.done).length}/{note.checklist.length}</span>}</div></button></>}
        <button type="button" className="note-resize-handle" data-note-board-control aria-label={`${note?.title || "새 메모"} 크기 조절`} title="끌어서 크기 조절 · 방향키로 20px 조절" disabled={!note} onPointerDown={event => start(event, id, "resize")} onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); const current = layoutRef.current.sizes[id] || defaultNoteSize, step = event.shiftKey ? 50 : 20; void commit({ kind: "resize", id, size: clampNoteSize(current.width + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), current.height + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)) }) }}><svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 12 7-7m-3 7 3-3" stroke="currentColor" strokeWidth="1.3" /></svg></button>
      </div>
    })}</div>
    {!visible.length && <div className="empty"><Icon name="note" size={28} /><h3>{query || scope !== "all" ? "찾는 메모가 없어요" : "첫 메모를 남겨 보세요"}</h3><p>지원한 기업을 @로 연결하고 자유롭게 정리하세요.</p><button className="btn primary" onClick={onNew}>+ 메모 작성</button></div>}
    {ghost && dragging && createPortal(<div className="note-drag-ghost" style={{ left: Math.min(ghost.x, innerWidth - 252), top: Math.min(ghost.y, innerHeight - 72) }}>{noteMap.get(dragging)?.title || "메모"}</div>, document.body)}
  </section>
}
