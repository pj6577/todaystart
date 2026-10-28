import React, { useState } from "react"
import { configuredEventKinds, EventKindChangeSchema, type EventKindConfig, type EventKindOption } from "../core/event-kinds"
import type { CareerEvent } from "../core/planner"
import { rpc } from "../messaging/protocol"
import { Icon, Notice } from "./components"
import { PlannerDialog } from "./planner-components"

export function EventKindsEditor({ config, events, generation, onClose, onSaved }: { config?: EventKindConfig; events: CareerEvent[]; generation?: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [initial] = useState(() => ({ kinds: configuredEventKinds(config), revision: config?.revision || 0, generation }))
  const [kinds, setKinds] = useState<EventKindOption[]>(() => initial.kinds.map(kind => ({ ...kind }))), [text, setText] = useState(""), [fallback, setFallback] = useState(initial.kinds.find(kind => kind.id === "other")?.id || initial.kinds[0]!.id), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const fallbackId = kinds.some(kind => kind.id === fallback) ? fallback : kinds[0]!.id
  const removed = initial.kinds.filter(kind => !kinds.some(item => item.id === kind.id)), affected = events.filter(event => removed.some(kind => kind.id === event.kind)).length
  function add() {
    const label = text.trim()
    if (!label || kinds.length >= 50) return
    if (kinds.some(kind => kind.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) { setError("같은 이름의 일정 종류가 있어요."); return }
    setKinds([...kinds, { id: `custom:${crypto.randomUUID()}`, label }]); setText(""); setError("")
  }
  function move(index: number, delta: number) { const next = [...kinds]; [next[index], next[index + delta]] = [next[index + delta]!, next[index]!]; setKinds(next) }
  async function save() {
    const change = EventKindChangeSchema.safeParse({ kinds, expectedRevision: initial.revision, fallbackId })
    if (!change.success) { setError(change.error.issues[0]?.message || "종류 이름을 확인해 주세요."); return }
    setBusy(true); setError("")
    try { await rpc({ type: "event_kinds_save", change: change.data, dataGeneration: initial.generation }); await onSaved(); onClose() }
    catch (error) { setError(error instanceof Error ? error.message : "일정 종류를 저장하지 못했어요.") }
    finally { setBusy(false) }
  }
  return <PlannerDialog title="일정 종류 관리" onClose={() => { if (!busy) onClose() }}>
    <p className="small muted">내 취업 활동에 맞게 종류를 추가하고 이름과 순서를 바꿔 보세요. ‘전체’는 모든 일정을 보여주는 필터예요.</p>
    {error && <Notice error>{error}</Notice>}
    <form onSubmit={event => { event.preventDefault(); void save() }}><fieldset className="event-kinds-fields" disabled={busy}>
      <div className="event-kinds-list">{kinds.map((kind, index) => <div className="event-kind-row" key={kind.id}><span>{index + 1}</span><label><span className="event-kind-count">일정 {events.filter(event => event.kind === kind.id).length}건</span><input aria-label={`일정 종류 ${index + 1} 이름`} value={kind.label} required maxLength={40} onChange={event => setKinds(kinds.map(item => item.id === kind.id ? { ...item, label: event.target.value } : item))} /></label><div className="event-kind-actions"><button type="button" className="icon-btn" disabled={!index} aria-label={`${kind.label} 위로`} onClick={() => move(index, -1)}>↑</button><button type="button" className="icon-btn" disabled={index === kinds.length - 1} aria-label={`${kind.label} 아래로`} onClick={() => move(index, 1)}>↓</button><button type="button" className="icon-btn" disabled={kinds.length === 1} aria-label={`${kind.label} 종류 삭제`} onClick={() => setKinds(kinds.filter(item => item.id !== kind.id))}><Icon name="close" size={15} /></button></div></div>)}</div>
      <div className="event-kinds-add"><input aria-label="새 일정 종류 이름" placeholder="예: 이력서 작성, 커피챗" maxLength={40} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add() } }} /><button type="button" className="btn" disabled={!text.trim() || kinds.length >= 50} onClick={add}>+ 종류 추가</button></div>
      <p className="small muted">종류는 최소 1개, 최대 50개까지 사용할 수 있어요.</p>
      {!!affected && <div className="event-kinds-reassign"><p>삭제한 종류에 있는 일정 {affected}건을 아래 종류로 옮겨요. 일정 내용과 날짜는 유지돼요.</p><label className="planner-field">기존 일정을 옮길 종류<select aria-label="기존 일정을 옮길 종류" value={fallbackId} onChange={event => setFallback(event.target.value)}>{kinds.map(kind => <option key={kind.id} value={kind.id}>{kind.label || "이름 없는 종류"}</option>)}</select></label></div>}
      <div className="planner-editor-footer"><span className="small muted">변경 사항은 저장 후 적용돼요.</span><div><button type="button" className="btn" onClick={onClose}>취소</button><button type="submit" className="btn primary">{busy ? "저장 중…" : "종류 저장"}</button></div></div>
    </fieldset></form>
  </PlannerDialog>
}
