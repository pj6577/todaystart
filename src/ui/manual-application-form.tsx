import { Modal, ModalTitle } from "./primitives/modal"
import { Button } from "./primitives/button"
import { Input, NativeSelect } from "./primitives/input"
import React, { useRef, useState } from "react"
import { statusLabel, type ApplicationStatus } from "../core/model"
import { platformIds } from "../core/platforms"
import { recruitmentBrands } from "./recruitment-brands"
import { rpc } from "../messaging/protocol"
import { Icon, Notice } from "./components"
import type { ManualApplicationPrefill } from "./manual-application-prefill"

export function ManualApplicationForm({ initial, generation, onClose, onSaved }: { initial?: ManualApplicationPrefill; generation?: string; onClose: () => void; onSaved: () => void }) {
  const dataGeneration = useRef(generation)
  const [selectedSource, setSelectedSource] = useState<string>(initial?.application.platform || "manual")
  const platform = platformIds.find(id => id === selectedSource) || "manual"
  const selectedBrand = recruitmentBrands.find(brand => brand.id === selectedSource)
  const [sourceLabel, setSourceLabel] = useState(initial?.application.sourceLabel || "기업 홈페이지")
  const [companyName, setCompanyName] = useState(initial?.application.companyName || "")
  const [jobTitle, setJobTitle] = useState(initial?.application.jobTitle || "")
  const [appliedAt, setAppliedAt] = useState(initial?.application.appliedAt || "")
  const [jobUrl, setJobUrl] = useState(initial?.application.jobUrl || "")
  const [status, setStatus] = useState<ApplicationStatus>("applied")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return <Modal className="modal manual-modal" busy={busy} onClose={onClose} aria-labelledby="manual-title">
    <div className="modal-heading"><ModalTitle asChild><h2 id="manual-title">지원 기록 직접 추가</h2></ModalTitle><Button variant="ghost" size="icon" className="icon-btn" aria-label="닫기" disabled={busy} onClick={onClose}><Icon name="close" size={18} /></Button></div>
    <p className="modal-description">{initial ? "지원 진행 항목의 정보를 미리 채웠어요. 지원 완료 여부와 내용을 확인한 뒤 기록해 주세요." : "지원한 채용 사이트나 경로를 선택해 기록을 남겨 주세요."}</p>
    <form onSubmit={event => {
      event.preventDefault(); setBusy(true); setError("")
      void rpc({ type: "manual_create", application: { platform, sourceLabel: platform === "manual" ? selectedBrand?.label || sourceLabel.trim() || undefined : undefined, companyName, jobTitle, appliedAt, status, jobUrl: jobUrl.trim() || undefined }, submissionAttemptId: platform === initial?.application.platform ? initial?.submissionAttemptId : undefined, dataGeneration: dataGeneration.current })
        .then(onSaved).catch(error => setError(error instanceof Error ? error.message : "기록을 저장하지 못했습니다.")).finally(() => setBusy(false))
    }}>
      <label>기업명<Input autoFocus required maxLength={300} value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="지원한 기업명" /></label>
      <label>지원 직무<Input required maxLength={1000} value={jobTitle} onChange={event => setJobTitle(event.target.value)} placeholder="예: 프론트엔드 개발자" /></label>
      <div className="form-columns"><label>지원 날짜<Input required type="date" value={appliedAt} onChange={event => setAppliedAt(event.target.value)} /></label><label>상태<NativeSelect value={status} onChange={event => setStatus(event.target.value as ApplicationStatus)}>{Object.entries(statusLabel).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></label></div>
      {initial && <p className="small muted">{initial.dateHint}</p>}
      <fieldset className="manual-source-fieldset" disabled={busy}><legend>지원 경로</legend><div className="manual-source-options">
        {recruitmentBrands.map(brand => <label className="manual-source-option" key={brand.id}><Input type="radio" name="application-source" value={brand.id} checked={selectedSource === brand.id} onChange={() => setSelectedSource(brand.id)} /><img className="platform-symbol" src={brand.symbol} alt="" width={20} height={20} /><span>{brand.label}</span></label>)}
        <label className="manual-source-option manual-source-other"><Input type="radio" name="application-source" value="manual" checked={selectedSource === "manual"} onChange={() => setSelectedSource("manual")} /><span>기업 홈페이지 · 기타</span></label>
      </div></fieldset>
      {selectedSource === "manual" && <label>경로 이름<Input maxLength={80} value={sourceLabel} onChange={event => setSourceLabel(event.target.value)} placeholder="예: 기업 홈페이지, 이메일, 다른 채용 사이트" /></label>}
      <label>공고 주소 <span className="muted">(선택)</span><Input type="url" maxLength={3000} value={jobUrl} onChange={event => setJobUrl(event.target.value)} placeholder="https://careers.example.com/jobs/..." /></label>
      {error && <div className="form-error"><Notice error>{error}</Notice></div>}
      <div className="modal-actions"><Button variant="outline" type="button"  disabled={busy} onClick={onClose}>취소</Button><Button variant="default" type="submit"  disabled={busy}>{busy ? "저장 중…" : "기록 추가"}</Button></div>
    </form>
  </Modal>
}
