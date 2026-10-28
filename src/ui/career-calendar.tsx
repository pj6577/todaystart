import React, { useId, useState } from "react"
import type { ApplicationRecord } from "../core/model"
import { calendarCells, compareEvents, type CareerEvent, type PlannerSnapshot } from "../core/planner"
import { shiftCalendarMonth } from "./application-calendar-data"
import { EventItem, linkedRecord, usePlannerNow } from "./planner-components"
import { Icon, Notice } from "./components"
import { CareerBoard, type CareerEventChange } from "./career-board"
import { useEventKinds } from "./event-kinds-context"

type CalendarView = "month" | "list" | "board"
const views = [{ id: "month", label: "캘린더", icon: "calendar" }, { id: "board", label: "준비 보드", icon: "grid" }, { id: "list", label: "목록", icon: "list" }] as const
const viewKey = "todaystart:calendar-view"
function initialView(): CalendarView {
  try { const saved = localStorage.getItem(viewKey); if (saved === "month" || saved === "board" || saved === "list") return saved } catch { /* Use the default when browser storage is unavailable. */ }
  return matchMedia("(max-width: 620px)").matches ? "list" : "month"
}

export function CareerCalendar({ planner, records, onNew, onOpen, onRecord, onChange, onManageKinds }: { planner: PlannerSnapshot; records: ApplicationRecord[]; onNew: (date: string, kind?: string) => void; onOpen: (event: CareerEvent) => void; onRecord: (linkId: string) => void; onChange: (event: CareerEvent, changes: CareerEventChange) => Promise<void>; onManageKinds: () => void }) {
  const { kinds, kindLabel } = useEventKinds(), viewId = useId()
  const { today } = usePlannerNow(), [month, setMonth] = useState(today.slice(0, 7)), [selected, setSelected] = useState(today), [mode, setMode] = useState<CalendarView>(initialView), [kind, setKind] = useState("all"), [includeDone, setIncludeDone] = useState(false), [history, setHistory] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false), [from, setFrom] = useState(""), [to, setTo] = useState("")
  const activeKind = kinds.some(item => item.id === kind) ? kind : "all"
  const invalidRange = !!from && !!to && from > to
  const filterCount = Number(activeKind !== "all") + Number(!!from || !!to) + Number(includeDone)
  function inDateRange(date: string) { return invalidRange || (!from || date >= from) && (!to || date <= to) }
  function addEvent() {
    let date = mode === "month" ? selected : today
    if (!invalidRange) { if (from && date < from) date = from; if (to && date > to) date = to }
    onNew(date, activeKind === "all" ? undefined : activeKind)
  }
  function selectView(next: CalendarView) { setMode(next); try { localStorage.setItem(viewKey, next) } catch { /* The view still changes when browser storage is unavailable. */ } }
  function clearFilters() { setKind("all"); setFrom(""); setTo(""); setIncludeDone(false) }
  const events = planner.events.filter(event => (includeDone || event.status === "planned") && (activeKind === "all" || event.kind === activeKind) && inDateRange(event.date)).sort(compareEvents)
  const applications = history && activeKind === "all" ? records.filter(record => record.status === "applied" && record.appliedAt && record.appliedAt <= today && inDateRange(record.appliedAt)) : []
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
    <div className="career-view-bar">
      <div className="career-view-tabs" role="tablist" aria-label="일정 보기" onKeyDown={event => {
        const index = views.findIndex(view => view.id === mode), direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
        const next = event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : direction ? (index + direction + views.length) % views.length : -1
        if (next < 0) return
        event.preventDefault(); selectView(views[next]!.id); event.currentTarget.querySelector<HTMLButtonElement>(`[data-view="${views[next]!.id}"]`)?.focus()
      }}>{views.map(view => <button key={view.id} id={`${viewId}-${view.id}`} type="button" role="tab" data-view={view.id} aria-selected={mode === view.id} aria-controls={`${viewId}-content`} tabIndex={mode === view.id ? 0 : -1} onClick={() => selectView(view.id)}><Icon name={view.icon} size={15} />{view.label}</button>)}</div>
      <button type="button" className="btn primary career-new-event" onClick={addEvent}>+ 일정 추가</button>
    </div>
    <div className="career-database-toolbar">
      {mode !== "board" ? <div className="career-month-navigation"><button className="icon-btn" aria-label="이전 달" onClick={() => move(-1)}>‹</button><h2 aria-live="polite">{monthLabel}</h2><button className="icon-btn" aria-label="다음 달" onClick={() => move(1)}>›</button></div> : <div className="career-board-scope"><h2>{filterCount ? "필터 결과" : "전체 예정 일정"}</h2><span>{events.length}건</span><small>날짜순</small></div>}
      <div className="career-database-tools"><button type="button" className="text-btn career-filter-toggle" aria-label="일정 필터" aria-expanded={filterOpen} aria-controls={`${viewId}-filters`} onClick={() => setFilterOpen(!filterOpen)}><Icon name="list" size={14} />필터{filterCount > 0 && <span>{filterCount}</span>}</button><button type="button" className="text-btn career-kind-manage" aria-label="종류 관리" onClick={onManageKinds}><Icon name="settings" size={14} />종류 추가·관리</button></div>
    </div>
    <div id={`${viewId}-filters`} className="career-filter-panel" hidden={!filterOpen}>
      <label className="career-filter-field"><span>일정 종류</span><select aria-label="일정 종류 필터" value={activeKind} onChange={event => setKind(event.target.value)}><option value="all">전체</option>{kinds.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="career-filter-field"><span>시작일 <small>선택</small></span><input aria-label="필터 시작일" type="date" max={to || undefined} value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label className="career-filter-field"><span>종료일 <small>선택</small></span><input aria-label="필터 종료일" type="date" min={from || undefined} value={to} onChange={event => setTo(event.target.value)} /></label>
      <div className="career-calendar-checks"><label className="planner-checkbox"><input type="checkbox" checked={includeDone} onChange={event => setIncludeDone(event.target.checked)} />완료·취소 포함</label>{mode !== "board" && <label className="planner-checkbox"><input type="checkbox" checked={history} onChange={event => setHistory(event.target.checked)} />지원 기록 표시</label>}</div>
    </div>
    {filterCount > 0 && <div className="career-active-filters" aria-label="적용된 필터">{activeKind !== "all" && <button onClick={() => setKind("all")} aria-label={`${kindLabel(activeKind)} 필터 해제`}>{kindLabel(activeKind)} <Icon name="close" size={12} /></button>}{(from || to) && <button onClick={() => { setFrom(""); setTo("") }} aria-label="기간 필터 해제">{from || "시작일 제한 없음"} ~ {to || "종료일 제한 없음"}<Icon name="close" size={12} /></button>}{includeDone && <button onClick={() => setIncludeDone(false)}>완료·취소 포함<Icon name="close" size={12} /></button>}<button className="text-btn" onClick={clearFilters}>필터 초기화</button></div>}
    {invalidRange && <Notice error>시작일은 종료일보다 늦을 수 없어요. 기간을 다시 선택해 주세요.</Notice>}
    <div id={`${viewId}-content`} role="tabpanel" aria-labelledby={`${viewId}-${mode}`}>
    {mode === "board" ? <CareerBoard events={events} today={today} records={records} links={planner.links} onOpen={onOpen} onChange={onChange} /> : mode === "month" ? <div className="career-calendar-layout"><div className="career-month-grid" role="group" aria-label={`${monthLabel} 일정 날짜`} onKeyDown={event => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-career-date]")
      const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key]
      if (!target || step === undefined) return
      const index = cells.indexOf(target.dataset.careerDate!), date = cells[index + step]
      if (date) { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>(`button[data-career-date="${date}"]`)?.focus() }
    }}><div className="career-weekdays" aria-hidden="true">{["월", "화", "수", "목", "금", "토", "일"].map(day => <span key={day}>{day}</span>)}</div><div className="career-days">{cells.map(date => { const { appointments, submitted, count } = entries(date), items = [...appointments.map(event => ({ id: event.id, title: `${event.time || ""} ${event.title}`.trim(), kind: event.kind })), ...submitted.map(record => ({ id: record.id, title: record.companyName, kind: "history" }))]; return <button key={date} data-career-date={date} className={`career-day${date.startsWith(month) ? "" : " outside"}`} aria-label={`${date} 일정 ${count}건`} aria-pressed={selected === date} aria-current={today === date ? "date" : undefined} tabIndex={date === selected ? 0 : -1} onClick={() => choose(date)}><span className="career-day-number">{Number(date.slice(8))}</span>{items.slice(0, 2).map(item => <span key={item.id} className={`career-day-event ${item.kind}`}>{item.title}</span>)}{count > 2 && <small>+{count - 2}개</small>}</button> })}</div></div>
      <aside className="career-day-agenda" aria-label="선택 날짜 일정"><div className="career-agenda-heading"><div><span>{Number(selected.slice(5,7))}월</span><h2>{Number(selected.slice(8))}일</h2></div></div><div className="career-agenda-list">{entries(selected).count ? agenda(selected) : <div className="planner-empty"><Icon name="calendar" size={25} /><p>등록된 일정이 없어요.<br />다가올 기회를 준비해 보세요.</p></div>}</div></aside></div> : <div className="career-list-view"><div className="career-list-heading"><h2>이달의 일정</h2></div>{listDates.length ? listDates.map(date => <section key={date} className="career-date-group"><h2>{date.replaceAll("-", ".")}</h2>{agenda(date)}</section>) : <div className="empty"><Icon name="calendar" size={28} /><h3>이달에 등록된 일정이 없어요</h3><p>면접, 과제 마감, 준비할 일을 추가해 보세요.</p></div>}</div>}
    </div>
  </section>
}
