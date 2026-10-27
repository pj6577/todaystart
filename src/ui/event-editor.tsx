import React, { useEffect, useRef, useState } from "react"
import type { ApplicationRecord } from "../core/model"
import { eventKinds, eventStatuses, type ApplicationLink, type EventDraft } from "../core/planner"
import { rpc } from "../messaging/protocol"
import { Notice } from "./components"
import { ApplicationPicker, ChecklistEditor, PlannerDialog, type PlannerCloseReason } from "./planner-components"
import { createDraftSession, type PlannerDraft } from "./planner-drafts"

export function EventEditor({ initial, recovered, records, links, generation, onClose }: { initial: EventDraft; recovered?: PlannerDraft; records: ApplicationRecord[]; links: ApplicationLink[]; generation?: string; onClose: (reason?: PlannerCloseReason, message?: string) => void }) {
  const [draft, setDraft] = useState(initial), [error, setError] = useState(""), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState<"delete">()
  const dataGeneration = useRef(generation), dirty = !!recovered || JSON.stringify(draft) !== JSON.stringify(initial)
  const recovery = useRef<ReturnType<typeof createDraftSession>>()
  if (!recovery.current) recovery.current = createDraftSession("event", generation, recovered)
  useEffect(() => { if (!dirty) return; const leaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }; window.addEventListener("beforeunload", leaving); return () => window.removeEventListener("beforeunload", leaving) }, [dirty])
  function update(patch: Partial<EventDraft>) {
    const next = { ...draft, ...patch }; setDraft(next)
    try { recovery.current!.write(next) } catch { setError("임시 저장 공간에 쓰지 못했어요. 일정 저장을 눌러 주세요.") }
  }
  function close(reason: PlannerCloseReason = "outside") {
    if (busy) return
    if (!dirty) { onClose(reason); return }
    try { recovery.current!.write(draft); onClose(reason, "일정 작성 내용을 임시 저장했어요. 다시 열어 이어 쓸 수 있어요.") }
    catch { setError("임시 저장하지 못했어요. 내용을 복사해 보관한 뒤 다시 시도해 주세요.") }
  }
  async function save() {
    setBusy(true); setError("")
    try { await rpc({ type: "event_save", event: { ...draft, title: draft.title.trim(), url: draft.url?.trim() || undefined }, dataGeneration: dataGeneration.current }); recovery.current!.clear(); onClose() }
    catch (error) { setError(error instanceof Error ? error.message : "일정을 저장하지 못했어요.") }
    finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setError("")
    try { await rpc({ type: "planner_remove", kind: "event", id: draft.id, revision: draft.expectedRevision, dataGeneration: dataGeneration.current }); recovery.current!.clear(); onClose() }
    catch (error) { setError(error instanceof Error ? error.message : "일정을 삭제하지 못했어요.") }
    finally { setBusy(false) }
  }
  return <PlannerDialog title={initial.expectedRevision ? "일정 수정" : "일정 추가"} onClose={close}>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <p className="small muted">{recovered ? "임시 저장한 내용을 이어 쓰고 있어요." : "작성 중인 내용은 임시 저장돼요. 일정 저장을 누르면 캘린더에 등록돼요."}</p>
      {error && <Notice error>{error}</Notice>}
      <label className="planner-field">일정 제목<input data-autofocus aria-label="일정 제목" required maxLength={200} placeholder="예: ○○기업 1차 면접" value={draft.title} onChange={event => update({ title: event.target.value })} /></label>
      <div className="planner-field-row"><label className="planner-field">일정 종류<select aria-label="일정 종류" value={draft.kind} onChange={event => update({ kind: event.target.value as EventDraft["kind"] })}>{Object.entries(eventKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="planner-field">진행 상태<select aria-label="일정 진행 상태" value={draft.status} onChange={event => update({ status: event.target.value as EventDraft["status"] })}>{Object.entries(eventStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <div className="planner-field-row"><label className="planner-field">날짜<input aria-label="일정 날짜" type="date" required value={draft.date} onChange={event => update({ date: event.target.value })} /></label><label className="planner-field">시간 <span className="muted">선택</span><input aria-label="일정 시간" type="time" value={draft.time || ""} onChange={event => update({ time: event.target.value || undefined })} /></label></div>
      <p className="small muted">시간을 모르면 비워 두세요. 시간 미정으로 표시해요.</p>
      <ApplicationPicker value={draft.linkId} records={records} links={links} onChange={linkId => update({ linkId })} />
      <label className="planner-field">장소<input aria-label="일정 장소" maxLength={1000} placeholder="예: 본사 3층 또는 온라인" value={draft.location} onChange={event => update({ location: event.target.value })} /></label>
      <label className="planner-field">접속·참고 링크<input aria-label="일정 링크" type="url" maxLength={3000} placeholder="https://" value={draft.url || ""} onChange={event => update({ url: event.target.value || undefined })} /></label>
      {draft.url?.startsWith("https://") && <a className="planner-link" href={draft.url} target="_blank" rel="noreferrer">링크 열기 ↗</a>}
      <label className="planner-field">일정 메모<textarea aria-label="일정 메모" maxLength={10000} rows={5} placeholder="안내받은 내용과 준비할 것을 남겨 주세요." value={draft.body} onChange={event => update({ body: event.target.value })} /></label>
      <ChecklistEditor value={draft.checklist} onChange={checklist => update({ checklist })} />
      {confirm ? <div className="planner-delete-confirm" role="alert"><p>이 일정을 삭제할까요?</p><button type="button" className="btn" disabled={busy} onClick={() => setConfirm(undefined)}>돌아가기</button><button type="button" className="btn danger" disabled={busy} onClick={() => void remove()}>일정 삭제</button></div> : <div className="planner-editor-footer">{initial.expectedRevision > 0 && <button type="button" className="text-btn" disabled={busy} onClick={() => setConfirm("delete")}>일정 삭제</button>}<div><button type="button" className="btn" disabled={busy} onClick={() => close()}>닫기</button><button className="btn primary" type="submit" disabled={busy || !draft.title.trim()}>{busy ? "저장 중…" : "일정 저장"}</button></div></div>}
    </form>
  </PlannerDialog>
}
