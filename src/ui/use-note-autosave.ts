import { useEffect, useRef, useState } from "react"
import type { NoteDraft } from "../core/planner"
import { rpc } from "../messaging/protocol"
import type { PlannerCloseReason } from "./planner-components"
import { createDraftSession, type PlannerDraft } from "./planner-drafts"

interface NoteAutosaveOptions {
  initial: NoteDraft
  recovered?: PlannerDraft
  generation?: string
  onClose(reason?: PlannerCloseReason, message?: string): void
  onIdentityChange?(draft: NoteDraft): void
}

export function useNoteAutosave({ initial, recovered, generation, onClose, onIdentityChange }: NoteAutosaveOptions) {
  const [draft, setDraft] = useState(initial), [status, setStatus] = useState(recovered ? "임시 저장한 내용 복원됨" : "저장 대기"), [error, setError] = useState(""), [busy, setBusy] = useState(false)
  const recovery = useRef<ReturnType<typeof createDraftSession>>()
  if (!recovery.current) recovery.current = createDraftSession("note", generation, recovered)
  const latest = useRef(initial), revision = useRef(initial.expectedRevision), sequence = useRef(recovered || !initial.expectedRevision ? 1 : 0), saved = useRef(0), pending = useRef<Promise<boolean>>(), timer = useRef<ReturnType<typeof setTimeout>>(), blocked = useRef(false), dataGeneration = useRef(generation), lastError = useRef("")
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
        const result = await rpc({ type: "note_save", note: { ...value, title: value.title.trim() || "제목 없는 메모", expectedRevision: revision.current }, dataGeneration: dataGeneration.current })
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
  useEffect(() => () => { void flush() }, [])
  return { draft, status, error, busy, update, flush, close, discard, remove, saveCopy }
}
