import React, { useEffect, useState } from "react"
import { safeJobUrl } from "../core/urls"
import { readStatusLabel, recordReadStatus, recordDateLabel, recordStatusLabel, requiresStatusReview, type ApplicationRecord } from "../core/model"
import { Icon, PlatformTag, Sentences } from "./components"
import { HistoryLink } from "./platform-links"
import { platformIds } from "../core/platforms"
import type { RecordSort, RecordSortKey } from "../core/record-order"

const columns: { key: RecordSortKey; label: string }[] = [
  { key: "companyName", label: "기업" }, { key: "jobTitle", label: "지원 직무" },
  { key: "source", label: "지원 경로" }, { key: "appliedAt", label: "지원일 / 작성일" },
  { key: "status", label: "상태" }, { key: "readStatus", label: "열람 여부" }
]
const pageSize = 100
const timeFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })

function submissionTime(record: ApplicationRecord) {
  if (!record.appliedAtTime || !record.appliedAt) return
  const date = new Date(record.appliedAtTime)
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) !== record.appliedAt) return
  return timeFormatter.format(date)
}

export function RecordTable({ records, total, sort, onSort, onEdit, onDelete, onAdd, onStatusEdit, onDetails, noteCounts = {}, showImportActions = true, pageKey = "" }: {
  records: ApplicationRecord[]; total: number
  sort: RecordSort; onSort: (key: RecordSortKey) => void
  onEdit: (record: ApplicationRecord) => void; onDelete: (record: ApplicationRecord) => void
  onAdd?: () => void
  onStatusEdit?: (record: ApplicationRecord) => void
  onDetails?: (record: ApplicationRecord) => void
  noteCounts?: Record<string, number>
  showImportActions?: boolean
  pageKey?: string
}) {
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [pageKey])
  const pages = Math.max(1, Math.ceil(records.length / pageSize)), currentPage = Math.min(page, pages)
  const start = (currentPage - 1) * pageSize, visible = records.slice(start, start + pageSize)
  if (!records.length) return <div className="empty">
    <div className="empty-symbol"><Icon name={total ? "search" : "list"} size={24} /></div>
    <h3>{total ? "검색 결과가 없습니다" : "지원 기록이 없습니다"}</h3>
    <p><Sentences>{total ? "검색어나 지원 경로 필터를 변경해 주세요. 취소 기록은 설정에서 표시할 수 있습니다." : "지원 현황에서 가져오거나 직접 추가할 수 있습니다."}</Sentences></p>
    {!total && <div className="empty-actions">{onAdd && <button className="btn" onClick={onAdd}>첫 지원 기록 직접 추가</button>}{showImportActions && platformIds.map(platform => <HistoryLink platform={platform} key={platform} />)}</div>}
  </div>
  return <>
    <div className="table-scroll"><table>
      <thead><tr>{columns.map(column => {
        const active = sort.key === column.key
        const nextDescending = active ? sort.direction === "ascending" : column.key === "appliedAt"
        return <th key={column.key} scope="col" aria-sort={active ? sort.direction : "none"}>
          <button type="button" className="table-sort-button" aria-label={`${column.label} 정렬`} title={`${column.label} ${nextDescending ? "내림차순" : "오름차순"} 정렬`} onClick={() => onSort(column.key)}>{column.label}<span aria-hidden="true">{active ? sort.direction === "ascending" ? "↑" : "↓" : "↕"}</span></button>
        </th>
      })}<th scope="col" className="actions-heading">관리</th></tr></thead>
      <tbody>{visible.map(record => {
        const url = safeJobUrl(record.jobUrl, record.platform)
        const time = submissionTime(record)
        return <tr key={record.id}>
          <td><div className="company-cell"><strong>{record.companyName}</strong></div></td>
          <td className="job-cell">{url ? <a href={url} target="_blank" rel="noreferrer">{record.jobTitle}<Icon name="external" size={12} /></a> : record.jobTitle}</td>
          <td><PlatformTag platform={record.platform} label={record.sourceLabel} /></td>
          <td className="date-cell" title={record.appliedAt ? "지원일" : record.sourceCreatedAt ? "사이트에 표시된 작성일 (지원일 미확인)" : "지원일과 작성일을 확인하지 못했어요"}>{recordDateLabel(record)}{time && <time className="submission-time" dateTime={record.appliedAtTime}>{time} 제출</time>}</td>
          <td><button type="button" className="status-review-button" aria-label={`${record.companyName} ${record.jobTitle} ${requiresStatusReview(record) ? "상태 확인" : "상태 수정"}`} onClick={() => (onStatusEdit || onEdit)(record)}><span className={`status ${record.status}${requiresStatusReview(record) ? " status-with-alert" : ""}`}>{recordStatusLabel(record)}{requiresStatusReview(record) && <span className="status-alert" aria-hidden="true">!</span>}</span></button></td>
          <td className="small muted">{readStatusLabel[recordReadStatus(record)]}</td>
          <td><div className="row-actions">{onDetails && <button aria-label={`${record.companyName} ${record.jobTitle} 메모와 일정`} onClick={() => onDetails(record)}>메모·일정{noteCounts[record.id] ? ` ${noteCounts[record.id]}` : ""}</button>}<button aria-label={`${record.companyName} ${record.jobTitle} 수정`} onClick={() => onEdit(record)}>수정</button><button aria-label={`${record.companyName} ${record.jobTitle} 삭제`} onClick={() => onDelete(record)}>삭제</button></div></td>
        </tr>
      })}</tbody>
    </table></div>
    <div className="table-footer"><span>{pages > 1 ? `${start + 1}–${start + visible.length}건 표시 / 검색 결과 ${records.length}건 / 전체 ${total}건` : `${records.length}건 표시 / 전체 ${total}건`}</span>{pages > 1 ? <nav className="record-pagination" aria-label="지원 기록 페이지"><button type="button" className="btn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전 페이지</button><span role="status" aria-live="polite">{currentPage} / {pages} 페이지</span><button type="button" className="btn" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>다음 페이지</button></nav> : <span>취소 기록 표시 여부는 설정에서 변경</span>}</div>
  </>
}
