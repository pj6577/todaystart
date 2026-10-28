import React, { useEffect, useState } from "react"
import { submissionStageLabel, type SubmissionAttempt } from "../submission/model"
import { platformLabel, type ApplicationRecord } from "../core/model"
import { Icon, Sentences } from "./components"

export function SubmissionActivity({ attempts = [], records, onEdit, onAdd }: {
  attempts?: SubmissionAttempt[]; records: ApplicationRecord[];
  onEdit?: (record: ApplicationRecord) => void; onAdd?: (attempt: SubmissionAttempt) => void
}) {
  const [dismissed, setDismissed] = useState<string[]>([])
  useEffect(() => { void chrome.storage.local.get("dismissedSubmissionAttempts").then(value => setDismissed(Array.isArray(value.dismissedSubmissionAttempts) ? value.dismissedSubmissionAttempts.filter((id): id is string => typeof id === "string") : [])) }, [])
  const visible = attempts.filter(attempt => (attempt.stage !== "confirmed" || !attempt.context) && !dismissed.includes(attempt.id) &&
    !records.some(record => record.submissionAttemptId === attempt.id && (record.status === "applied" || record.status === "cancelled"))).slice(-5).reverse()
  if (!visible.length) return null
  return <section className="submission-activity card" aria-label="지원 진행 상태">
    <h2>지원 진행 상태</h2>
    {visible.map(attempt => {
      const record = records.find(value => value.submissionAttemptId === attempt.id)
      const message = attempt.stage === "confirmed" ? "제출 성공을 확인했습니다. 기업·직무 정보가 없어 지원 현황에서 가져오거나 직접 추가해 주세요." : attempt.stage === "started" ? "지원창을 열었습니다. 최종 제출 결과를 확인하면 기록합니다." : attempt.stage === "submitting" ? "최종 제출 결과를 기다리고 있습니다." : attempt.platform === "jobkorea" && attempt.reason === "navigation" ? "제출 후 화면이 바뀌었습니다. 완료 표시를 아직 확인할 수 없어 지원 여부 확인이 필요합니다." : "지원 완료 결과를 확인하지 못했습니다. 지원 여부를 직접 확인하거나 지원 현황에서 가져와 주세요."
      return <div className="submission-item" key={attempt.id}>
        <div><strong>{attempt.context ? `${attempt.context.companyName} · ${attempt.context.jobTitle}` : `${platformLabel[attempt.platform]} 공고 ${attempt.sourceJobId}`}</strong><span className="small muted">{platformLabel[attempt.platform]} · {submissionStageLabel[attempt.stage]}</span><p className="small muted"><Sentences>{message}</Sentences></p>{!attempt.context && <p className="small muted">기업·직무 정보를 확인하지 못해 지원 기록은 아직 만들지 않았습니다.</p>}</div>
        <div className="submission-actions">{record && onEdit ? <button className="btn" onClick={() => onEdit(record)}>완료 여부 확인</button> : (attempt.stage === "unverified" || attempt.stage === "confirmed") && onAdd ? <button className="btn" onClick={() => onAdd(attempt)}>직접 추가</button> : null}<button className="icon-btn" aria-label={`${attempt.context?.companyName || attempt.sourceJobId} 진행 안내 닫기`} onClick={() => { const next = [...dismissed, attempt.id].slice(-100); setDismissed(next); void chrome.storage.local.set({ dismissedSubmissionAttempts: next }) }}><Icon name="close" size={16} /></button></div>
      </div>
    })}
  </section>
}
