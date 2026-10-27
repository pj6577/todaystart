import React, { useEffect, useRef } from "react"
import { Notice } from "./components"

export function ResetDataDialog({ count, noteCount = 0, eventCount = 0, busy, error, onClose, onReset }: { count: number; noteCount?: number; eventCount?: number; busy: boolean; error: string; onClose: () => void; onReset: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="modal reset-data-dialog" aria-labelledby="reset-data-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <h2 id="reset-data-title">지원 데이터를 초기화할까요?</h2>
    <p className="modal-description">저장된 지원 기록 {count.toLocaleString()}건, 메모 {noteCount.toLocaleString()}건, 일정 {eventCount.toLocaleString()}건과 가져오기·제출 진행 상태를 삭제합니다. 진행 중인 가져오기는 중지합니다.</p>
    <p className="modal-description">화면 모드와 수집 설정은 유지됩니다. 채용 사이트의 지원 내역은 삭제되지 않습니다. 필요한 기록은 먼저 JSON으로 백업해 주세요.</p>
    {error && <Notice error>{error}</Notice>}
    <div className="modal-actions"><button autoFocus className="btn" disabled={busy} onClick={onClose}>취소</button><button className="btn danger" disabled={busy} onClick={onReset}>{busy ? "초기화 중…" : "지원 데이터 삭제"}</button></div>
  </dialog>
}
