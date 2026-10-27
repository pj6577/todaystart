import React from "react"
import type { CareerEvent } from "../core/planner"
import { dateDistanceLabel, eventKinds, upcomingEvents } from "../core/planner"
import { Icon } from "./components"
import { usePlannerNow } from "./planner-components"

export function UpcomingEvents({ events, onOpen, onAll, onNew }: { events: CareerEvent[]; onOpen: (event: CareerEvent) => void; onAll: () => void; onNew: () => void }) {
  const { today, nowTime } = usePlannerNow(), upcoming = upcomingEvents(events, today, nowTime)
  return <section className="upcoming-events" aria-label="다가오는 일정"><div className="section-label"><h2><Icon name="calendar" size={17} />다가오는 일정</h2><button className="text-btn" aria-label="취업 캘린더 전체 보기" onClick={onAll}>전체 보기<Icon name="arrow" size={14} /></button></div>{upcoming.length ? <div className="upcoming-grid">{upcoming.slice(0,3).map(event => <button className={`upcoming-card ${event.kind}`} key={event.id} onClick={() => onOpen(event)}><span>{dateDistanceLabel(event.date, today)}<small>{eventKinds[event.kind]}</small></span><strong>{event.title}</strong><time>{event.date.slice(5).replace("-", ".")} · {event.time || "시간 미정"}</time></button>)}</div> : <div className="upcoming-empty"><p>다가오는 면접과 마감일을 한곳에 모아 보세요.</p><button className="btn" onClick={onNew}>+ 일정 추가</button></div>}</section>
}
