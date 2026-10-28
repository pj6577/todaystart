import React, { useId, useRef, useState } from "react"
import type { ApplicationRecord } from "../core/model"
import { dateDistanceLabel, preparationStates, type CareerEvent, type PlannerSnapshot, type PreparationState } from "../core/planner"
import { useEventKinds } from "./event-kinds-context"
import { Icon, Notice } from "./components"
import { EventItem, linkedRecord } from "./planner-components"

export type CareerEventChange = Partial<Pick<CareerEvent, "preparation" | "status" | "checklist">>
const stages = Object.entries(preparationStates) as [PreparationState, string][]
const shortDate = (date: string) => `${Number(date.slice(5, 7))}.${Number(date.slice(8))}`

export function CareerBoard({ events, today, records, links, onOpen, onChange }: {
  events: CareerEvent[]
  today: string
  records: ApplicationRecord[]
  links: PlannerSnapshot["links"]
  onOpen: (event: CareerEvent) => void
  onChange: (event: CareerEvent, changes: CareerEventChange) => Promise<void>
}) {
  const { kindLabel } = useEventKinds()
  const detailId = useId(), [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<string>(), [error, setError] = useState(""), [announcement, setAnnouncement] = useState(""), [dragging, setDragging] = useState<string>(), [over, setOver] = useState<PreparationState>()
  const pending = useRef(false), draggedId = useRef<string>()
  const planned = events.filter(event => event.status === "planned"), finished = events.filter(event => event.status !== "planned")

  async function change(event: CareerEvent, changes: CareerEventChange) {
    if (pending.current) return
    pending.current = true; setBusy(event.id); setError(""); setAnnouncement("")
    try {
      await onChange(event, changes)
      setAnnouncement(changes.preparation ? `${event.title} · ${preparationStates[changes.preparation]}로 저장했어요.` : changes.status ? `${event.title} · 일정을 마쳤어요.` : `${event.title} · 체크리스트를 저장했어요.`)
    } catch (error) { setError(error instanceof Error ? error.message : "준비 상태를 저장하지 못했어요. 다시 시도해 주세요.") }
    finally { pending.current = false; setBusy(undefined) }
  }
  function move(id: string, preparation: PreparationState) {
    const event = planned.find(event => event.id === id)
    if (event && (event.preparation || "not_started") !== preparation) void change(event, { preparation })
  }
  function endDrag() { draggedId.current = undefined; setDragging(undefined); setOver(undefined) }
  function toggle(id: string) { setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }) }

  return <div className="career-board">
    {error && <Notice error>{error}</Notice>}
    <div className="career-board-columns" aria-busy={!!busy}>{stages.map(([stage, label]) => {
      const cards = planned.filter(event => (event.preparation || "not_started") === stage)
      return <section key={stage} className={`career-board-column ${stage}${over === stage ? " drop-target" : ""}`} aria-label={label} onDragOver={event => { if (!draggedId.current || pending.current) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver(stage) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(current => current === stage ? undefined : current) }} onDrop={event => { if (!draggedId.current || pending.current) return; event.preventDefault(); move(draggedId.current, stage); endDrag() }}>
        <div className="career-board-column-heading"><h3><span aria-hidden="true" />{label}</h3><span>{cards.length}</span></div>
        <div className="career-board-cards">{cards.map(event => {
          const record = linkedRecord(event.linkId, records, links), done = event.checklist.filter(task => task.done).length
          return <article key={event.id} className={`career-board-card ${event.kind}${dragging === event.id ? " dragging" : ""}`} aria-label={event.title} draggable={!busy} onDragStart={drag => { if (pending.current || (drag.target as HTMLElement).closest("select,input")) { drag.preventDefault(); return }; draggedId.current = event.id; setDragging(event.id); drag.dataTransfer.effectAllowed = "move"; drag.dataTransfer.setData("text/plain", event.id) }} onDragEnd={endDrag}>
            <button type="button" className="career-board-card-toggle" aria-label={`${event.title} ${expanded.has(event.id) ? "접기" : "펼치기"}`} aria-expanded={expanded.has(event.id)} aria-controls={`${detailId}-${event.id}`} onClick={() => toggle(event.id)}>
              <span className="career-board-card-summary"><span className={`career-board-kind ${event.kind}`} title={kindLabel(event.kind)}>{kindLabel(event.kind)}</span><span className="career-board-card-title" title={event.title}>{event.title}</span><span className="career-board-card-chevron" aria-hidden="true">›</span></span>
              <span className="career-board-card-date"><time dateTime={`${event.date}${event.time ? `T${event.time}` : ""}`}><Icon name="calendar" size={12} />{event.date.slice(0, 4) === today.slice(0, 4) ? shortDate(event.date) : event.date.replaceAll("-", ".")} · {event.time || "시간 미정"}</time><span className={event.date <= today ? "due" : ""}>{event.date < today ? `미완료 · ${dateDistanceLabel(event.date, today)}` : dateDistanceLabel(event.date, today)}</span></span>
            </button>
            <div id={`${detailId}-${event.id}`} className="career-board-card-detail" role="region" aria-label={`${event.title} 상세`} hidden={!expanded.has(event.id)}>
            {expanded.has(event.id) && <>
            <div className="career-board-card-meta">{record && <div><strong>{record.companyName}</strong><span>{record.jobTitle}</span></div>}<button type="button" className="text-btn career-board-card-open" onClick={() => onOpen(event)} disabled={!!busy}>일정 수정</button></div>
            {event.checklist.length > 0 && <div className="career-board-checklist"><div className="career-board-progress-label"><span>준비 체크리스트</span><span>{done}/{event.checklist.length}</span></div><div className="career-board-progress" role="progressbar" aria-label={`${event.title} 체크리스트`} aria-valuenow={done} aria-valuemin={0} aria-valuemax={event.checklist.length}><span style={{ width: `${done / event.checklist.length * 100}%` }} /></div>{event.checklist.slice(0, 2).map(task => <label key={task.id}><input type="checkbox" checked={task.done} disabled={!!busy} onChange={input => void change(event, { checklist: event.checklist.map(item => item.id === task.id ? { ...item, done: input.target.checked } : item) })} /><span className={task.done ? "done" : ""}>{task.text}</span></label>)}{event.checklist.length > 2 && <button className="text-btn" disabled={!!busy} onClick={() => onOpen(event)}>준비 항목 {event.checklist.length}개 보기</button>}</div>}
            <div className="career-board-card-footer"><select aria-label={`${event.title} 준비 상태`} value={event.preparation || "not_started"} disabled={!!busy} onChange={input => move(event.id, input.target.value as PreparationState)}>{stages.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>{stage === "ready" ? <button type="button" className="text-btn" disabled={!!busy} onClick={() => void change(event, { status: "completed" })}>일정 마치기</button> : <button type="button" className="text-btn" disabled={!!busy} onClick={() => move(event.id, stage === "not_started" ? "in_progress" : "ready")}>{stage === "not_started" ? "준비 시작" : "준비 완료"}<Icon name="arrow" size={12} /></button>}</div>
            {busy === event.id && <span className="career-board-saving">저장 중…</span>}
            </>}
            </div>
          </article>
        })}{!cards.length && <div className="career-board-column-empty"><Icon name={stage === "ready" ? "check" : "calendar"} size={20} /><p>{stage === "not_started" ? "준비할 일정을 추가해 보세요." : stage === "in_progress" ? "준비를 시작한 일정을 옮겨 주세요." : "준비를 마친 일정이 여기에 모여요."}</p></div>}</div>
      </section>
    })}</div>
    {!planned.length && !!finished.length && <p className="career-board-note">선택한 기간에 준비할 일정이 없어요.</p>}
    <div className="career-board-bottom"><p>준비 완료 후에도 일정은 예정으로 남아요. 실제 일정이 끝나면 ‘일정 마치기’를 눌러 주세요.</p><span role="status" aria-live="polite">{announcement}</span></div>
    {finished.length > 0 && <section className="career-board-finished" aria-label="완료·취소 일정"><h2>완료·취소 일정 <span>{finished.length}건</span></h2>{finished.map(event => <EventItem key={event.id} event={event} record={linkedRecord(event.linkId, records, links)} onOpen={() => onOpen(event)} />)}</section>}
  </div>
}
