import { Modal, ModalTitle } from "./primitives/modal"
import { NativeSelect, Input } from "./primitives/input"
import { Button } from "./primitives/button"
import React, { useEffect, useId, useMemo, useState, type ReactNode } from "react"
import type { ApplicationRecord } from "../core/model"
import type { ApplicationLink, CareerEvent, Note } from "../core/planner"
import { eventStatuses } from "../core/planner"
import { useEventKinds } from "./event-kinds-context"
import { Icon } from "./components"
import { linkedRecordMap } from "../core/planner-lookups"
export { linkedRecord } from "../core/planner-lookups"

export function usePlannerNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const local = new Date(now + 9 * 60 * 60 * 1000).toISOString()
  return { today: local.slice(0, 10), nowTime: local.slice(11, 16) }
}

export function ApplicationPicker({ value, records, links, onChange }: { value?: string; records: ApplicationRecord[]; links: ApplicationLink[]; onChange: (value?: string) => void }) {
  const available = useMemo(() => linkedRecordMap(records, links), [records, links])
  return <label className="planner-field">지원 연결<NativeSelect aria-label="지원 연결" value={value || ""} onChange={event => onChange(event.target.value || undefined)}><option value="">연결 없이 작성</option>{value && !available.has(value) && <option value={value}>삭제된 지원 · 연결 해제 필요</option>}{[...available].map(([id, record]) => <option key={id} value={id}>{record.companyName} · {record.jobTitle}</option>)}</NativeSelect></label>
}
export function ChecklistEditor({ value, onChange }: { value: Note["checklist"]; onChange: (value: Note["checklist"]) => void }) {
  const [text, setText] = useState("")
  function add() { if (!text.trim() || value.length >= 100) return; onChange([...value, { id: crypto.randomUUID(), text: text.trim(), done: false }]); setText("") }
  return <div className="planner-checklist"><h3>체크리스트</h3>{value.map(item => <div className="checklist-item" key={item.id}><label><Input type="checkbox" checked={item.done} onChange={event => onChange(value.map(task => task.id === item.id ? { ...task, done: event.target.checked } : task))} /><span className={item.done ? "done" : ""}>{item.text}</span></label><Button variant="ghost" size="icon" type="button" className="icon-btn" aria-label={`${item.text} 할 일 삭제`} onClick={() => onChange(value.filter(task => task.id !== item.id))}><Icon name="close" size={14} /></Button></div>)}<div className="checklist-add"><Input aria-label="새 할 일" maxLength={500} placeholder="준비할 일을 적어 주세요" value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add() } }} /><Button variant="outline" type="button"  disabled={!text.trim() || value.length >= 100} onClick={add}>할 일 추가</Button></div></div>
}
export type PlannerCloseReason = "outside" | "close"
export function PlannerDialog({ title, onClose, children, wide = false }: { title: string; onClose: (reason: PlannerCloseReason) => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId()
  return <Modal className={`planner-drawer${wide ? " wide" : ""}`} aria-labelledby={titleId} overlayClassName="planner-backdrop" dismissOutside onClose={() => onClose("outside")}><div className="planner-drawer-heading"><ModalTitle asChild><h2 id={titleId}>{title}</h2></ModalTitle><Button variant="ghost" size="icon" className="icon-btn" aria-label="닫기" onClick={() => onClose("outside")}><Icon name="close" size={19} /></Button></div>{children}</Modal>
}
export function EventItem({ event, record, onOpen }: { event: CareerEvent; record?: ApplicationRecord; onOpen: () => void }) {
  const { kindLabel } = useEventKinds()
  return <Button variant="unstyled" type="button" className={`career-event-item ${event.kind} ${event.status}`} onClick={onOpen}><span className="event-kind">{kindLabel(event.kind)}</span><div><strong>{event.title}</strong><span>{event.date.replaceAll("-", ".")} · {event.time || "시간 미정"}{record ? ` · ${record.companyName}` : ""}</span></div>{event.status !== "planned" && <small>{eventStatuses[event.status]}</small>}<Icon name="arrow" size={16} /></Button>
}
