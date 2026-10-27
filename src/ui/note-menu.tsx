import React, { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import { noteColors, noteTemplates, type NoteDraft } from "../core/planner"
import { defaultNoteSize, type NoteSize } from "../core/note-board"

export function NoteMenu({ anchor, owner, draft, onChange, onClose, onDelete, onResize, onMove, canMoveUp, canMoveDown }: { anchor: RefObject<HTMLButtonElement>; owner: string; draft: NoteDraft; onChange: (patch: Partial<NoteDraft>) => void; onClose: () => void; onDelete: () => void; onResize?: (size: NoteSize) => void; onMove?: (direction: -1 | 1) => void; canMoveUp?: boolean; canMoveDown?: boolean }) {
  const panel = useRef<HTMLDivElement>(null), [position, setPosition] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    function place() { const rect = anchor.current?.getBoundingClientRect(); if (!rect) return; const height = panel.current?.offsetHeight || 400; setPosition({ left: Math.max(8, Math.min(innerWidth - 252, rect.right - 244)), top: Math.max(8, Math.min(rect.bottom + 6, innerHeight - height - 8)) }) }
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true)
    const observer = new MutationObserver(place), board = document.querySelector(".notes-board"); if (board) observer.observe(board, { childList: true })
    panel.current?.querySelector<HTMLElement>('select,button:not(:disabled)')?.focus()
    return () => { observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true) }
  }, [])
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose() }
    document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside)
  }, [onClose])
  function finish() { onClose(); anchor.current?.focus() }
  return createPortal(<div ref={panel} className="note-popover" role="dialog" aria-label="메모 메뉴" data-note-menu-owner={owner} style={position} onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && !anchor.current?.contains(event.relatedTarget)) onClose() }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish() } }}>
    <div className="note-popover-heading">메모 설정</div>
    <label className="note-menu-field">메모 색상<select aria-label="메모 색상" value={draft.color || "yellow"} onChange={event => onChange({ color: event.target.value as NoteDraft["color"] })}>{Object.entries(noteColors).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
    <label className="note-menu-check"><input type="checkbox" checked={draft.pinned} onChange={event => onChange({ pinned: event.target.checked })} />상단에 고정</label>
    <div className="note-menu-section"><span>카드 크기</span><div className="note-size-presets">{[["작게", 280, 280], ["기본", defaultNoteSize.width, defaultNoteSize.height], ["넓게", 500, 400]].map(([label, width, height]) => <button type="button" disabled={!onResize} key={label} onClick={() => { onResize?.({ width: Number(width), height: Number(height) }); finish() }}>{label}</button>)}</div></div>
    <div className="note-menu-section"><button type="button" disabled={!canMoveUp} onClick={() => { onMove?.(-1); finish() }}>앞으로 이동</button><button type="button" disabled={!canMoveDown} onClick={() => { onMove?.(1); finish() }}>뒤로 이동</button></div>
    <details className="note-menu-templates"><summary>메모 양식</summary>{Object.values(noteTemplates).map(template => <button type="button" key={template.label} disabled={!!draft.body.trim() || !!draft.checklist.length} onClick={() => { onChange({ title: draft.title || template.title, body: template.body, checklist: template.tasks.map(text => ({ id: crypto.randomUUID(), text, done: false })) }); finish() }}>{template.label}</button>)}</details>
    <div className="note-menu-section"><button type="button" className="note-menu-delete" onClick={() => { onClose(); onDelete() }}>메모 삭제</button></div>
  </div>, document.body)
}
