import React, { useLayoutEffect, useRef, useState } from "react"
import { sourceLabel } from "../core/model"
import { applicationPathLabel, type ApplicationPath } from "../core/application-path"
import { Icon } from "./components"
import { applicationCalendar, shiftCalendarMonth } from "./application-calendar-data"

export function ApplicationCalendar({ data, month, today, source, onMonth }: { data: ReturnType<typeof applicationCalendar>; month: string; today: string; source: ApplicationPath | "all"; onMonth: (month: string) => void }) {
  const [selection, setSelection] = useState(today)
  const selected = selection.startsWith(month + "-") ? selection : undefined
  const entries = selected ? data.days.get(selected) || [] : []
  const list = useRef<HTMLUListElement>(null)
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = 0 }, [selected, source, month])
  const title = `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`
  return <section className="analytics-panel calendar-panel" aria-labelledby="calendar-title">
    <div className="analytics-heading"><div><h2 id="calendar-title">지원 캘린더</h2><p>{source === "all" ? "전체" : applicationPathLabel(source)} · 이달 지원 {data.total}건</p></div>
      <div className="calendar-navigation">
        <button className="calendar-today" onClick={() => { onMonth(today.slice(0, 7)); setSelection(today) }}>오늘</button>
        <button className="icon-btn" aria-label="이전 달" onClick={() => onMonth(shiftCalendarMonth(month, -1))}><span aria-hidden="true">‹</span></button>
        <span className="calendar-month" aria-live="polite">{title}</span>
        <button className="icon-btn" aria-label="다음 달" disabled={month >= today.slice(0, 7)} onClick={() => onMonth(shiftCalendarMonth(month, 1))}><span aria-hidden="true">›</span></button>
      </div>
    </div>
    <div className="application-calendar" role="group" aria-label={`${title} 지원 날짜별 분포`} onKeyDown={event => {
      const day = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-date]")
      if (!day) return
      const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key]
      if (step === undefined) return
      event.preventDefault()
      const date = new Date(`${day.dataset.date}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() + step)
      const target = event.currentTarget.querySelector<HTMLButtonElement>(`button[data-date="${date.toISOString().slice(0, 10)}"]`)
      if (target && !target.disabled) target.focus({ preventScroll: true })
    }}>
      <div className="calendar-weekdays" aria-hidden="true">{["월", "화", "수", "목", "금", "토", "일"].map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-days">{data.cells.map((cell, index) => cell ? <button key={cell.date} className="calendar-day" disabled={cell.future}
        aria-label={`${cell.date} 지원 ${cell.records.length}건`} aria-pressed={selected === cell.date} aria-current={cell.date === today ? "date" : undefined}
        data-date={cell.date} data-count={cell.records.length > 0} tabIndex={(selected || `${month}-01`) === cell.date ? 0 : -1} onFocus={() => setSelection(cell.date)} onClick={() => setSelection(cell.date)}>
        <span>{cell.day}</span>{cell.records.length > 0 && <small>{cell.records.length}건</small>}
      </button> : <span key={`blank-${index}`} className="calendar-blank" aria-hidden="true" />)}</div>
    </div>
    <div className="calendar-selection" aria-live="polite">
      {selected ? <><div className="calendar-selection-heading"><h3>{Number(selected.slice(5, 7))}월 {Number(selected.slice(8))}일</h3><span>{entries.length}건</span></div>
        {entries.length ? <ul className="calendar-records" ref={list} tabIndex={0} aria-label={`${selected} 지원 기록`}>{entries.map(record => <li key={record.id}><div><strong>{record.companyName}</strong><p>{record.jobTitle}</p></div><span>{sourceLabel(record)}</span></li>)}</ul> : <p className="calendar-empty">이날의 지원 기록이 없습니다.</p>}
      </> : <p className="calendar-empty"><Icon name="list" size={14} />날짜를 선택하면 지원 기록을 볼 수 있어요.</p>}
    </div>
    {data.undated > 0 && <p className="analytics-footnote calendar-undated">지원 날짜 미확인 {data.undated}건</p>}
  </section>
}
