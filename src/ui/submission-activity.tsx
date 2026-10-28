import React, { useEffect, useState } from "react"
import { submissionStageLabel, type SubmissionAttempt } from "../submission/model"
import { platformLabel, type ApplicationRecord } from "../core/model"
import { Icon, Sentences } from "./components"
import { submissionActivityGroups } from "./submission-activity-data"

export function SubmissionActivity({ attempts = [], records, onEdit, onAdd }: {
  attempts?: SubmissionAttempt[]; records: ApplicationRecord[];
  onEdit?: (record: ApplicationRecord) => void; onAdd?: (attempt: SubmissionAttempt) => void
}) {
  const [dismissed, setDismissed] = useState<string[]>([])
  useEffect(() => { void chrome.storage.local.get("dismissedSubmissionAttempts").then(value => setDismissed(Array.isArray(value.dismissedSubmissionAttempts) ? value.dismissedSubmissionAttempts.filter((id): id is string => typeof id === "string") : [])) }, [])
  const visible = submissionActivityGroups(attempts, records, dismissed).slice(0, 5)
  if (!visible.length) return null
  return <section className="submission-activity card" aria-label="지원 진행 상태">
    <h2>지원 진행 상태</h2>
    {visible.map(group => {
      const { attempt, record } = group
      const issue = attempt.completionIssue && ({ ambiguous_attempts: "완료 표시는 확인했지만 여러 제출창 중 어느 창의 결과인지 구분하지 못했어요. 지원 현황에서 확인해 주세요.", missing_context: "완료 표시는 확인했지만 공고 정보를 연결하지 못했어요. 지원 현황에서 확인해 주세요.", posting_mismatch: "완료 화면의 공고 번호가 지원창과 달라 자동으로 연결하지 못했어요. 지원 현황에서 확인해 주세요." } as const)[attempt.completionIssue]
      const message = issue || (attempt.stage === "confirmed" ? "제출 성공을 확인했습니다. 기업·직무 정보가 없어 지원 현황에서 가져오거나 직접 추가해 주세요." : attempt.stage === "started" ? "지원창을 열었습니다. 최종 제출 결과를 확인하면 기록합니다." : attempt.stage === "submitting" ? "최종 제출 결과를 기다리고 있습니다." : attempt.platform === "jobkorea" && attempt.reason === "navigation" ? "제출 후 화면이 바뀌었습니다. 완료 표시를 아직 확인할 수 없어 지원 여부 확인이 필요합니다." : "지원 완료 결과를 확인하지 못했습니다. 지원 여부를 직접 확인하거나 지원 현황에서 가져와 주세요.")
      return <div className="submission-item" key={group.key}>
        <div><strong>{attempt.context ? `${attempt.context.companyName} · ${attempt.context.jobTitle}` : record ? `${record.companyName} · ${record.jobTitle}` : `${platformLabel[attempt.platform]} 공고 ${attempt.sourceJobId}`}</strong><span className="small muted">{platformLabel[attempt.platform]} · {submissionStageLabel[attempt.stage]}{group.attempts.length > 1 ? ` · 같은 공고 안내 ${group.attempts.length}건` : ""}</span><p className="small muted"><Sentences>{message}</Sentences></p>{!attempt.context && !record && <p className="small muted">기업·직무 정보를 확인하지 못해 지원 기록은 아직 만들지 않았습니다.</p>}</div>
        <div className="submission-actions">{record && onEdit ? <button className="btn" onClick={() => onEdit(record)}>완료 여부 확인</button> : (attempt.stage === "unverified" || attempt.stage === "confirmed") && onAdd ? <button className="btn" onClick={() => onAdd(attempt)}>직접 추가</button> : null}<button className="icon-btn" aria-label={`${platformLabel[attempt.platform]} ${attempt.context?.companyName || record?.companyName || attempt.sourceJobId} 진행 안내 닫기`} onClick={() => { const next = [...new Set([...dismissed, ...group.attempts.map(attempt => attempt.id)])].slice(-100); setDismissed(next); void chrome.storage.local.set({ dismissedSubmissionAttempts: next }) }}><Icon name="close" size={16} /></button></div>
      </div>
    })}
  </section>
}
