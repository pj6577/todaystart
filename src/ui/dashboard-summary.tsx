import React from "react"
import { type ApplicationRecord } from "../core/model"
import { applicationPathLabel, type ApplicationPath } from "../core/application-path"
import { applicationReadingStats } from "./dashboard-stats"

export function DashboardSummary({ records, source = "all" }: { records?: ApplicationRecord[]; source?: ApplicationPath | "all" }) {
  const items = (records || []).filter(record => record.status === "applied")
  const { total, read, unread, rejected, unknown } = applicationReadingStats(records || [])
  const companies = new Set(items.filter(record => record.status === "applied").map(record => record.normalizedCompanyName)).size
  const pending = (records || []).filter(record => record.status === "pending_confirmation").length
  const manual = items.filter(record => record.platform === "manual").length
  const number = (value: number) => records ? value.toLocaleString() : "—"
  return <section className="dashboard-summary" aria-label="지원 통계">
    <div className="summary-primary">
      <dl className="summary-total stat-card"><dt className="stat-top">{source === "all" ? "전체 지원 수" : `${applicationPathLabel(source)} 지원 수`}</dt><dd className="stat-number">{number(total)}<small>건</small></dd></dl>
      <div className="summary-details">
        <dl className="summary-companies"><dt>지원한 기업</dt><dd><strong>{number(companies)}</strong>곳</dd></dl>
        <p>확인 대기 {number(pending)}건<span aria-hidden="true">·</span>직접 지원 {number(manual)}건</p>
      </div>
    </div>
    <div className="summary-reading">
      <div className="summary-reading-heading"><h2>열람 현황</h2></div>
      <div className="summary-read-counts">
        <dl className="stat-card"><dt className="stat-top">열람</dt><dd className="stat-number">{number(read)}<small>건</small></dd></dl>
        <dl className="stat-card"><dt className="stat-top">미열람</dt><dd className="stat-number">{number(unread)}<small>건</small></dd></dl>
      </div>
      <div className="reading-distribution" role="img" aria-label={`열람 ${read}건(이 중 불합격 ${rejected}건), 미열람 ${unread}건, 미확인 ${unknown}건`}>
        {total > 0 && <><span className="distribution-read" style={{ width: `${read / total * 100}%` }}>{read > 0 && <span className="distribution-rejected" style={{ width: `${rejected / read * 100}%` }} />}</span><span className="distribution-unread" style={{ width: `${unread / total * 100}%` }} /><span className="distribution-unknown" style={{ width: `${unknown / total * 100}%` }} /></>}
      </div>
      <p className="summary-reading-rejection">열람 {number(read)}건 중 <strong>불합격 {number(rejected)}건</strong></p>
      <p className="summary-reading-note" title="지원 기록은 저장되어 있지만 사이트에서 열람 여부를 확인하지 못했어요. 전체 지원 수와 막대의 회색 구간에 포함돼요.">열람 여부를 알 수 없는 기록 {number(unknown)}건</p>
    </div>
  </section>
}
