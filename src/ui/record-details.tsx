import React, { useState } from "react"
import type { ApplicationRecord } from "../core/model"
import { recordDateLabel, recordStatusLabel } from "../core/model"
import type { CareerEvent, Note, PlannerSnapshot } from "../core/planner"
import { compareEvents } from "../core/planner"
import { safeJobUrl } from "../core/urls"
import { PlatformTag } from "./components"
import { EventItem, PlannerDialog } from "./planner-components"
import { noteLinkIds } from "../core/note-mentions"

export function RecordDetails({ record, linkId, planner, onClose, onNote, onEvent }: { record: ApplicationRecord; linkId: string; planner: PlannerSnapshot; onClose: () => void; onNote: (note?: Note) => void; onEvent: (event?: CareerEvent) => void }) {
  const [tab, setTab] = useState("overview"), notes = planner.notes.filter(note => noteLinkIds(note).includes(linkId)).sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)), events = planner.events.filter(event => event.linkId === linkId).sort(compareEvents), url = safeJobUrl(record.jobUrl, record.platform)
  return <PlannerDialog title="지원 상세" onClose={onClose}><div className="record-detail-title"><PlatformTag platform={record.platform} label={record.sourceLabel} /><h2>{record.companyName}</h2><p>{record.jobTitle}</p></div><div className="planner-tabs record-detail-tabs" role="group" aria-label="지원 상세 보기">{[["overview", "개요"], ["notes", `메모 ${notes.length}`], ["events", `일정 ${events.length}`]].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key!)}>{label}</button>)}</div>
    {tab === "overview" ? <><dl className="record-detail-meta"><div><dt>지원일 / 작성일</dt><dd>{recordDateLabel(record)}</dd></div><div><dt>지원 상태</dt><dd>{recordStatusLabel(record)}</dd></div></dl>{url && <a className="btn" href={url} target="_blank" rel="noreferrer">공고 열기 ↗</a>}<div className="detail-quick-actions"><button className="btn" onClick={() => onNote()}>+ 메모 작성</button><button className="btn" onClick={() => onEvent()}>+ 일정 추가</button></div><p className="small muted">이 지원의 메모와 일정은 기록을 다시 가져와도 유지돼요.</p></> : tab === "notes" ? <><div className="detail-section-heading"><h3>연결된 메모</h3><button className="btn" onClick={() => onNote()}>+ 메모 작성</button></div>{notes.length ? notes.map(note => <button className="detail-note" key={note.id} onClick={() => onNote(note)}><strong>{note.title}</strong><p>{note.body || "본문 없는 메모"}</p></button>) : <p className="planner-empty">기업 조사, 면접 준비와 복기를 남겨 보세요.</p>}</> : <><div className="detail-section-heading"><h3>연결된 일정</h3><button className="btn" onClick={() => onEvent()}>+ 일정 추가</button></div>{events.length ? events.map(event => <EventItem key={event.id} event={event} onOpen={() => onEvent(event)} />) : <p className="planner-empty">면접과 과제 마감 일정을 연결해 보세요.</p>}</>}
  </PlannerDialog>
}
