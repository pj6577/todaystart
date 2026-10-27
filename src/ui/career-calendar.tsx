import React, { useState } from "react"
import type { ApplicationRecord } from "../core/model"
import { calendarCells, compareEvents, eventKinds, type CareerEvent, type PlannerSnapshot } from "../core/planner"
import { shiftCalendarMonth } from "./application-calendar-data"
import { EventItem, linkedRecord, usePlannerNow } from "./planner-components"
import { Icon } from "./components"

export function CareerCalendar({ planner, records, onNew, onOpen, onRecord }: { planner: PlannerSnapshot; records: ApplicationRecord[]; onNew: (date: string) => void; onOpen: (event: CareerEvent) => void; onRecord: (linkId: string) => void }) {
  const { today } = usePlannerNow(), [month, setMonth] = useState(today.slice(0, 7)), [selected, setSelected] = useState(today), [mode, setMode] = useState(() => matchMedia("(max-width: 620px)").matches ? "list" : "month"), [kind, setKind] = useState("all"), [includeDone, setIncludeDone] = useState(false), [history, setHistory] = useState(true)
  const events = planner.events.filter(event => (includeDone || event.status === "planned") && (kind === "all" || event.kind === kind)).sort(compareEvents)
  const applications = history && kind === "all" ? records.filter(record => record.status === "applied" && record.appliedAt && record.appliedAt <= today) : []
  const cells = calendarCells(month), monthLabel = `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`
  function choose(date: string) { setSelected(date); setMonth(date.slice(0, 7)) }
  function move(offset: number) { const next = shiftCalendarMonth(month, offset); setMonth(next); setSelected(next + "-01") }
  function entries(date: string) {
    const appointments = events.filter(event => event.date === date), submitted = applications.filter(record => record.appliedAt === date)
    return { appointments, submitted, count: appointments.length + submitted.length }
  }
  function agenda(date: string) {
    const { appointments, submitted } = entries(date)
    return <>{appointments.map(event => <EventItem key={event.id} event={event} record={linkedRecord(event.linkId, records, planner.links)} onOpen={() => onOpen(event)} />)}{submitted.map(record => { const link = planner.links.find(link => link.recordId === record.id); return <button key={record.id} className="career-history-item" disabled={!link} onClick={() => link && onRecord(link.id)}><span>지원 완료</span><div><strong>{record.companyName}</strong><small>{record.jobTitle}</small></div><Icon name="arrow" size={15} /></button> })}</>
  }
  const listDates = [...new Set([...events.filter(event => event.date.startsWith(month)).map(event => event.date), ...applications.filter(record => record.appliedAt?.startsWith(month)).map(record => record.appliedAt!)])].sort()
  return <section className="career-calendar" aria-label="취업 일정 캘린더">
    <div className="planner-toolbar"><div className="career-month-navigation"><button className="btn" onClick={() => choose(today)}>오늘</button><button className="icon-btn" aria-label="이전 달" onClick={() => move(-1)}>‹</button><h2 aria-live="polite">{monthLabel}</h2><button className="icon-btn" aria-label="다음 달" onClick={() => move(1)}>›</button></div><div className="career-view-actions"><div className="planner-tabs" role="group" aria-label="캘린더 보기"><button aria-pressed={mode === "month"} onClick={() => setMode("month")}>월간</button><button aria-pressed={mode === "list"} onClick={() => setMode("list")}>목록</button></div><button className="btn primary" onClick={() => onNew(selected)}>+ 일정 추가</button></div></div>
    <div className="career-calendar-options"><div className="planner-tabs event-filters" role="group" aria-label="일정 종류 필터"><button aria-pressed={kind === "all"} onClick={() => setKind("all")}>전체</button>{Object.entries(eventKinds).map(([key, label]) => <button key={key} aria-pressed={kind === key} onClick={() => setKind(key)}>{label}</button>)}</div><div className="career-calendar-checks"><label className="planner-checkbox"><input type="checkbox" checked={history} onChange={event => setHistory(event.target.checked)} />지원 기록 표시</label><label className="planner-checkbox"><input type="checkbox" checked={includeDone} onChange={event => setIncludeDone(event.target.checked)} />완료·취소 포함</label></div></div>
    {mode === "month" ? <div className="career-calendar-layout"><div className="career-month-grid" role="group" aria-label={`${monthLabel} 일정 날짜`} onKeyDown={event => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-career-date]")
      const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key]
      if (!target || step === undefined) return
      const index = cells.indexOf(target.dataset.careerDate!), date = cells[index + step]
      if (date) { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>(`button[data-career-date="${date}"]`)?.focus() }
    }}><div className="career-weekdays" aria-hidden="true">{["월", "화", "수", "목", "금", "토", "일"].map(day => <span key={day}>{day}</span>)}</div><div className="career-days">{cells.map(date => { const { appointments, submitted, count } = entries(date), items = [...appointments.map(event => ({ id: event.id, title: `${event.time || ""} ${event.title}`.trim(), kind: event.kind })), ...submitted.map(record => ({ id: record.id, title: record.companyName, kind: "history" }))]; return <button key={date} data-career-date={date} className={`career-day${date.startsWith(month) ? "" : " outside"}`} aria-label={`${date} 일정 ${count}건`} aria-pressed={selected === date} aria-current={today === date ? "date" : undefined} tabIndex={date === selected ? 0 : -1} onClick={() => choose(date)}><span className="career-day-number">{Number(date.slice(8))}</span>{items.slice(0, 2).map(item => <span key={item.id} className={`career-day-event ${item.kind}`}>{item.title}</span>)}{count > 2 && <small>+{count - 2}개</small>}</button> })}</div></div>
      <aside className="career-day-agenda" aria-label="선택 날짜 일정"><div className="career-agenda-heading"><div><span>{Number(selected.slice(5,7))}월</span><h2>{Number(selected.slice(8))}일</h2></div><button className="btn" onClick={() => onNew(selected)}>+ 일정 추가</button></div><div className="career-agenda-list">{entries(selected).count ? agenda(selected) : <div className="planner-empty"><Icon name="calendar" size={25} /><p>등록된 일정이 없어요.<br />다가올 기회를 준비해 보세요.</p></div>}</div></aside></div> : <div className="career-list-view">{listDates.length ? listDates.map(date => <section key={date} className="career-date-group"><h2>{date.replaceAll("-", ".")}</h2>{agenda(date)}</section>) : <div className="empty"><Icon name="calendar" size={28} /><h3>이달에 등록된 일정이 없어요</h3><p>면접, 과제 마감, 준비할 일을 추가해 보세요.</p><button className="btn primary" onClick={() => onNew(selected)}>+ 일정 추가</button></div>}</div>}
  </section>
}
