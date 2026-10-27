import React, { useEffect, useRef, useState, type ReactNode } from "react"
import type { ApplicationRecord } from "../core/model"
import { type ApplicationLink, type NoteDraft } from "../core/planner"
import { ChecklistEditor, linkedRecord, type PlannerCloseReason } from "./planner-components"
import { Icon, Notice } from "./components"
import type { PlannerDraft } from "./planner-drafts"
import { useNoteAutosave } from "./use-note-autosave"
import { noteLinkIds } from "../core/note-mentions"
import { NoteMentionInput } from "./note-mentions"
import { NoteMenu } from "./note-menu"
import type { NoteSize } from "../core/note-board"

export function NoteEditor({ initial, recovered, records, links, generation, onClose, onNew, dragHandle, menuInitiallyOpen = false, onResize, onMove, canMoveUp, canMoveDown, onIdentityChange }: { initial: NoteDraft; recovered?: PlannerDraft; records: ApplicationRecord[]; links: ApplicationLink[]; generation?: string; onClose: (reason?: PlannerCloseReason, message?: string) => void; onNew?: () => void; dragHandle?: ReactNode; menuInitiallyOpen?: boolean; onResize?: (size: NoteSize) => void; onMove?: (direction: -1 | 1) => void; canMoveUp?: boolean; canMoveDown?: boolean; onIdentityChange?: (draft: NoteDraft) => void }) {
  const { draft, status, error, busy, update, flush, close, discard, remove, saveCopy } = useNoteAutosave({ initial, recovered, generation, onClose, onIdentityChange })
  const [deleting, setDeleting] = useState(false)
  const card = useRef<HTMLElement>(null), finish = useRef<() => void>(), [menu, setMenu] = useState(menuInitiallyOpen), [tasksVisible, setTasksVisible] = useState(initial.checklist.length > 0)
  const menuButton = useRef<HTMLButtonElement>(null)
  const ownerId = useRef(draft.id)
  ownerId.current = draft.id
  finish.current = () => void close("outside")
  useEffect(() => {
    if (!menuInitiallyOpen) card.current?.querySelector<HTMLInputElement>('[data-autofocus]')?.focus()

    const outside = (event: PointerEvent) => { if (event.target instanceof Element && !card.current?.contains(event.target) && !event.target.closest(`[data-note-menu-owner="${ownerId.current}"]`) && !event.target.closest("[data-note-board-control]")) finish.current?.() }
    document.addEventListener("pointerdown", outside)
    return () => { document.removeEventListener("pointerdown", outside) }
  }, [])
  return <article ref={card} className="note-card sticky-sheet sticky-note-editor" data-note-color={draft.color || "yellow"} role="region" aria-label="메모 편집" onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); if (menu) setMenu(false); else void close("outside") } }}>
    <header className="note-card-toolbar">{dragHandle}<span>{draft.pinned ? "고정한 메모" : "메모"}</span><button ref={menuButton} type="button" className="icon-btn" aria-label="메모 더 보기" aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="more" size={17} /></button><button type="button" className="icon-btn" aria-label="메모 편집 마치기" disabled={busy} onClick={() => void close("outside")}><Icon name="close" size={16} /></button></header>
    {menu && <NoteMenu anchor={menuButton} owner={draft.id} draft={draft} onChange={update} onClose={() => setMenu(false)} onDelete={() => setDeleting(true)} onResize={onResize} onMove={onMove} canMoveUp={canMoveUp} canMoveDown={canMoveDown} />}
    {error && <div className="planner-error"><Notice error>{error}</Notice><div className="planner-inline-actions"><button className="btn" disabled={busy} onClick={() => void flush(true)}>저장 다시 시도</button><button className="btn" disabled={busy} onClick={() => void saveCopy()}>새 메모로 저장</button><button className="text-btn" disabled={busy} onClick={discard}>임시 내용 버리고 닫기</button></div></div>}
    <div className="note-editor-content">
    <label className="planner-field note-title-field"><span>메모 제목</span><input data-autofocus aria-label="메모 제목" maxLength={200} placeholder="제목을 적어 주세요" value={draft.title} onChange={event => update({ title: event.target.value })} /></label>
    <NoteMentionInput owner={draft.id} compact body={draft.body} mentions={draft.mentions} records={records} links={links} onChange={(body, mentions) => update({ body, mentions, linkId: draft.linkId && draft.mentions?.some(mention => mention.linkId === draft.linkId) && !mentions.some(mention => mention.linkId === draft.linkId) ? undefined : draft.linkId })} />
    {noteLinkIds(draft).length > 0 && <div className="note-linked-companies" aria-label="언급한 기업">{noteLinkIds(draft).map(id => { const record = linkedRecord(id, records, links), label = record?.companyName || draft.mentions?.find(mention => mention.linkId === id)?.label || "삭제된 지원"; return <span key={id}><span title={record?.jobTitle}>@{label}</span><button type="button" aria-label={`${label} 언급 해제`} onClick={() => update({ linkId: draft.linkId === id ? undefined : draft.linkId, mentions: (draft.mentions || []).filter(mention => mention.linkId !== id) })}><Icon name="close" size={12} /></button></span> })}</div>}
    {(tasksVisible || draft.checklist.length > 0) && <ChecklistEditor value={draft.checklist} onChange={checklist => update({ checklist })} />}
    </div>
    {deleting ? <div className="planner-delete-confirm" role="alert"><p>이 메모를 삭제할까요?</p><button className="btn" disabled={busy} onClick={() => setDeleting(false)}>돌아가기</button><button className="btn danger" disabled={busy} onClick={() => void remove()}>메모 삭제</button></div> : <footer className="sticky-note-footer"><span className="note-save-status" role="status">{status}</span><button type="button" className="text-btn" aria-label="체크리스트 추가" onClick={() => setTasksVisible(!tasksVisible)}>☐</button><button type="button" className="text-btn" aria-label="저장하고 닫기" disabled={busy} onClick={() => void close()}>완료</button></footer>}
  </article>
}
