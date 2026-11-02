import React, { useMemo, useRef } from "react"
import { sourceLabel, type ApplicationRecord } from "../core/model"
import { compareApplicationRecords } from "../core/record-order"
import { safeJobUrl } from "../core/urls"
import { Icon } from "./components"
import { PlatformSymbol } from "./platform-logo"
import { Button } from "./primitives/button"
import { Modal, ModalTitle } from "./primitives/modal"

export function JobSearchHistoryDialog({ companyName, records, onClose }: { companyName: string; records: ApplicationRecord[]; onClose(): void }) {
  const title = useRef<HTMLHeadingElement>(null)
  const ordered = useMemo(() => [...records].sort(compareApplicationRecords), [records])
  return <Modal className="job-search-history-dialog" dismissOutside onClose={onClose} onOpenAutoFocus={event => { event.preventDefault(); title.current?.focus() }}>
    <header className="search-history-dialog-heading"><div><ModalTitle asChild><h2 ref={title} tabIndex={-1}>이전 지원 내역</h2></ModalTitle><p className="search-history-dialog-company">{companyName}</p><p className="search-history-dialog-count">지원 완료 {ordered.length}건<span>최근 지원순</span></p></div><Button variant="ghost" size="icon" aria-label="지원 이력 닫기" onClick={onClose}><Icon name="close" size={19} /></Button></header>
    {ordered.length ? <ol className="search-history-list" aria-label="이전 지원 내역">{ordered.map(record => {
      const url = safeJobUrl(record.jobUrl, record.platform)
      return <li className="search-history-entry" key={record.id}>
        <div className="search-history-entry-meta"><span>{record.platform === "manual" ? <Icon name="note" size={18} /> : <PlatformSymbol platform={record.platform} />}{sourceLabel(record)}</span>{record.appliedAt ? <time dateTime={record.appliedAt}>{record.appliedAt}</time> : <span>지원일 미확인</span>}</div>
        <h3>{record.jobTitle}</h3><p className="search-history-entry-company">{record.companyName}</p>
        {url && <Button asChild variant="outline" size="sm" className="search-history-entry-link"><a href={url} target="_blank" rel="noreferrer">지원 공고 보기<Icon name="external" size={13} /></a></Button>}
      </li>
    })}</ol> : <p className="search-history-dialog-empty">저장된 지원 내역이 없어요.</p>}
    <footer className="search-history-dialog-footer"><Button variant="secondary" onClick={onClose}>닫기</Button></footer>
  </Modal>
}
