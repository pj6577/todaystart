import React, { useEffect, useRef } from "react"
import { Icon, Sentences } from "./components"
import { requiresStatusReview, statusLabel, type ApplicationRecord, type ApplicationStatus } from "../core/model"

interface RecordEditDialogProps {
  record: ApplicationRecord
  review: boolean
  focusStatus: boolean
  hasNext: boolean
  busy: boolean
  onChange(record: ApplicationRecord): void
  onClose(): void
  onSave(next: boolean): Promise<void>
}
export function RecordEditDialog({ record, review, focusStatus, hasNext, busy, onChange, onClose, onSave }: RecordEditDialogProps) {
  const statusInput = useRef<HTMLSelectElement>(null)
  useEffect(() => { if (focusStatus) statusInput.current?.focus() }, [record.id, focusStatus])
  return <div className="modal-backdrop" onKeyDown={e => { if (e.key === "Escape") onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
      <div className="modal-heading"><h2 id="edit-title">지원 기록 수정</h2><button className="icon-btn" aria-label="닫기" onClick={() => onClose()}><Icon name="close" size={18} /></button></div>
      {review && <p className="modal-description">실제 지원 현황을 확인한 뒤 상태를 선택해 주세요.<br />알 수 없는 지원 날짜는 비워둘 수 있어요.</p>}
      <form onSubmit={e => { e.preventDefault(); void onSave(false) }}>
        <label>기업명<input autoFocus={!focusStatus} required maxLength={300} value={record.companyName} onChange={e => onChange({ ...record, companyName: e.target.value })} /></label>
        <label>지원 직무<input required maxLength={1000} value={record.jobTitle} onChange={e => onChange({ ...record, jobTitle: e.target.value })} /></label>
        <label>지원 날짜<input type="date" value={record.appliedAt || ""} onChange={e => onChange({ ...record, appliedAt: e.target.value || undefined })} /></label>
        <label>상태<select ref={statusInput} aria-label="상태" value={record.status} onChange={e => onChange({ ...record, status: e.target.value as ApplicationStatus })}>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <div className="modal-actions"><button className="btn" type="button" disabled={busy} onClick={() => onClose()}>취소</button>{review && hasNext && <button className="btn" type="button" disabled={busy || requiresStatusReview(record)} onClick={() => void onSave(true)}>저장하고 다음 확인</button>}<button className="btn primary" disabled={busy || review && requiresStatusReview(record)} type="submit">변경 저장</button></div>
      </form>
    </section></div>
}

interface RecordDeleteDialogProps {
  record: ApplicationRecord
  linked: boolean
  busy: boolean
  onLinkedChange(linked: boolean): void
  onClose(): void
  onDelete(): void
}
export function RecordDeleteDialog({ record, linked, busy, onLinkedChange, onClose, onDelete }: RecordDeleteDialogProps) {
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <h2 id="delete-title">지원 기록을 삭제할까요?</h2><p className="modal-description">{record.companyName} · {record.jobTitle}<br /><Sentences>채용 사이트의 지원은 취소되지 않습니다. 같은 내역을 가져오면 다시 저장될 수 있습니다.</Sentences></p>
      <label className="planner-checkbox"><input type="checkbox" checked={linked} onChange={event => onLinkedChange(event.target.checked)} />연결된 메모와 일정도 함께 삭제</label><p className="small muted">선택하지 않으면 지원 연결만 해제하고 메모와 일정을 보관해요.</p>
      <div className="modal-actions"><button className="btn" onClick={() => onClose()}>돌아가기</button><button className="btn danger" disabled={busy} onClick={onDelete}>기록 삭제</button></div>
    </section></div>
}
