import React, { useEffect, useRef, useState, type ReactNode } from "react"
import type { ApplicationRecord } from "../core/model"
import { type ApplicationLink, type Note, type NoteDraft } from "../core/planner"
import { rpc } from "../messaging/protocol"
import { ChecklistEditor, linkedRecord, type PlannerCloseReason } from "./planner-components"
import { Icon, Notice } from "./components"
import { createDraftSession, type PlannerDraft } from "./planner-drafts"
import { noteLinkIds } from "../core/note-mentions"
import { NoteMentionInput } from "./note-mentions"
import { NoteMenu } from "./note-menu"
import type { NoteSize } from "../core/note-board"

export function NoteEditor({ initial, recovered, records, links, generation, onClose, onNew, dragHandle, menuInitiallyOpen = false, onResize, onMove, canMoveUp, canMoveDown, onIdentityChange }: { initial: NoteDraft; recovered?: PlannerDraft; records: ApplicationRecord[]; links: ApplicationLink[]; generation?: string; onClose: (reason?: PlannerCloseReason, message?: string) => void; onNew?: () => void; dragHandle?: ReactNode; menuInitiallyOpen?: boolean; onResize?: (size: NoteSize) => void; onMove?: (direction: -1 | 1) => void; canMoveUp?: boolean; canMoveDown?: boolean; onIdentityChange?: (draft: NoteDraft) => void }) {
  const [draft, setDraft] = useState(initial), [status, setStatus] = useState(recovered ? "임시 저장한 내용 복원됨" : "저장 대기"), [error, setError] = useState(""), [deleting, setDeleting] = useState(false), [busy, setBusy] = useState(false)
  const recovery = useRef<ReturnType<typeof createDraftSession>>()
  if (!recovery.current) recovery.current = createDraftSession("note", generation, recovered)
  const latest = useRef(initial), revision = useRef(initial.expectedRevision), sequence = useRef(recovered || !initial.expectedRevision ? 1 : 0), saved = useRef(0), pending = useRef<Promise<boolean>>(), timer = useRef<ReturnType<typeof setTimeout>>(), blocked = useRef(false), dataGeneration = useRef(generation), lastError = useRef("")
  const card = useRef<HTMLElement>(null), finish = useRef<() => void>(), [menu, setMenu] = useState(menuInitiallyOpen), [tasksVisible, setTasksVisible] = useState(initial.checklist.length > 0)
  const menuButton = useRef<HTMLButtonElement>(null)
  finish.current = () => void close("outside")
  function update(patch: Partial<NoteDraft>) {
    latest.current = { ...latest.current, ...patch }; sequence.current++; setDraft(latest.current); setStatus("저장 대기")
    try { recovery.current!.write({ ...latest.current, expectedRevision: revision.current }) } catch { setError("임시 저장 공간에 쓰지 못했어요. 저장하고 닫기를 눌러 주세요.") }
  }
  async function persist(): Promise<boolean> {
    if (pending.current) return pending.current
    if (saved.current === sequence.current) return true
    const value = latest.current, current = sequence.current
    setStatus("저장 중…")
    pending.current = (async () => {
      try {
        const result = await rpc<Note>({ type: "note_save", note: { ...value, title: value.title.trim() || "제목 없는 메모", expectedRevision: revision.current }, dataGeneration: dataGeneration.current })
        revision.current = result.revision; saved.current = current
        if (current === sequence.current) recovery.current!.clear()
        else recovery.current!.write({ ...latest.current, expectedRevision: revision.current })
        lastError.current = ""; setError(""); setStatus(current === sequence.current ? "저장됨" : "저장 대기"); return true
      } catch (error) { blocked.current = true; lastError.current = error instanceof Error ? error.message : "메모를 저장하지 못했어요."; setError(lastError.current); setStatus("저장하지 못함"); return false }
      finally { pending.current = undefined }
    })()
    return pending.current
  }
  async function flush(force = false) { clearTimeout(timer.current); if (force) blocked.current = false; if (blocked.current) return false; while (saved.current < sequence.current) if (!await persist()) return false; return true }
  useEffect(() => { if (!blocked.current) timer.current = setTimeout(() => void flush(), 600); return () => clearTimeout(timer.current) }, [draft])
  useEffect(() => { const leaving = (event: BeforeUnloadEvent) => { if (saved.current < sequence.current) { event.preventDefault(); event.returnValue = "" } }; window.addEventListener("beforeunload", leaving); return () => window.removeEventListener("beforeunload", leaving) }, [])
  useEffect(() => {
    if (!menuInitiallyOpen) card.current?.querySelector<HTMLInputElement>('[data-autofocus]')?.focus()

    const outside = (event: PointerEvent) => { if (event.target instanceof Element && !card.current?.contains(event.target) && !event.target.closest(`[data-note-menu-owner="${latest.current.id}"]`) && !event.target.closest("[data-note-board-control]")) finish.current?.() }
    document.addEventListener("pointerdown", outside)
    return () => { document.removeEventListener("pointerdown", outside); void flush() }
  }, [])
  async function close(reason: PlannerCloseReason = "close") {
    if (busy) return
    setBusy(true)
    if (await flush()) onClose(reason)
    else try { recovery.current!.write({ ...latest.current, expectedRevision: revision.current }); onClose(reason, `${lastError.current} 작성 내용은 임시 저장했어요. 다시 열어 이어 쓸 수 있어요.`) }
    catch { setError("임시 저장하지 못했어요. 내용을 복사해 보관한 뒤 다시 시도해 주세요.") }
    setBusy(false)
  }
  function discard() { clearTimeout(timer.current); blocked.current = true; saved.current = sequence.current; recovery.current!.clear(); onClose("outside") }
  async function remove() {
    if (busy) return
    setBusy(true)
    if (await flush()) try { if (revision.current) await rpc({ type: "planner_remove", kind: "note", id: latest.current.id, revision: revision.current, dataGeneration: dataGeneration.current }); recovery.current!.clear(); onClose() } catch (error) { setError(error instanceof Error ? error.message : "삭제하지 못했어요.") }
    setBusy(false)
  }
  async function saveCopy() { if (busy) return; setBusy(true); await pending.current; revision.current = 0; latest.current = { ...latest.current, id: crypto.randomUUID(), expectedRevision: 0 }; sequence.current++; setDraft(latest.current); if (await flush(true)) onIdentityChange?.({ ...latest.current, expectedRevision: revision.current }); setBusy(false) }
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
