import React from "react"
import type { ApplicationRecord } from "../core/model"
import { platformIds } from "../core/platforms"
import type { Settings } from "../storage/settings"
import type { HistoryRun } from "../collection/history-run-model"
import { HistoryTask } from "./platform-links"
import { Icon } from "./components"

export function RecordReviewPanel({ records, settings, run, onShowAll }: { records: ApplicationRecord[]; settings?: Settings; run?: HistoryRun; onShowAll: () => void }) {
  const sources = platformIds.filter(platform => records.some(record => record.platform === platform))
  return <section className="record-review-panel" aria-label="지원 상태 확인">
    <div className="section-label"><h2>{records.length ? <><span className="review-alert" aria-hidden="true">!</span>지원 상태 확인이 필요한 기록 {records.length}건</> : <><Icon name="check" size={17} />상태 확인을 모두 마쳤어요</>}</h2><button className="text-btn" onClick={onShowAll}>전체 기록 보기</button></div>
    {records.length > 0 && <p>사이트에서 기록을 다시 가져오면 확인된 상태가 반영돼요.<br />남은 기록은 표의 상태 표시를 눌러 수정할 수 있어요.</p>}
    {sources.length > 0 && <ul className="review-imports" aria-label="지원 현황에서 다시 가져오기">{sources.map(platform => <li key={platform}><HistoryTask compact platform={platform} enabled={settings?.consent[platform] !== false} busy={run?.status === "running"} collecting={run?.status === "running" && run.platform === platform} /></li>)}</ul>}
  </section>
}
