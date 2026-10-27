import React, { useMemo, useState, type CSSProperties } from "react"
import { type ApplicationRecord, type ApplicationSource } from "../core/model"
import { applicationPathLabel, type ApplicationPath } from "../core/application-path"
import { dashboardStats, localDate, sharePercent } from "./dashboard-stats"
import { applicationCalendar } from "./application-calendar-data"
import { ApplicationCalendar } from "./application-calendar"
import { DashboardEncouragement } from "./dashboard-encouragement"
import { recruitmentBrands } from "./recruitment-brands"

const sourceColors: Record<ApplicationSource, string> = { saramin: "#4b75f5", jobkorea: "#15a6ad", wanted: "#8b6bd6", remember: "#c76c43", manual: "#a1a1aa" }
function sourceBrand(path: ApplicationPath) { return recruitmentBrands.find(brand => brand.id === path || brand.label === applicationPathLabel(path)) }
function sourceColor(path: ApplicationPath) {
  if (!path.startsWith("manual:")) return sourceColors[path as ApplicationSource]
  const colors = ["#c17e56", "#728d71", "#9a79a8", "#668dba", "#aa8961"]
  const hash = [...path].reduce((value, char) => value + char.charCodeAt(0), 0)
  return colors[hash % colors.length]!
}
type Source = ApplicationPath | "all"
export function DashboardAnalytics({ records, source, onSource }: { records?: ApplicationRecord[]; source: Source; onSource: (source: Source) => void }) {
  const today = localDate()
  const [month, setMonth] = useState(today.slice(0, 7))
  const all = useMemo(() => dashboardStats(records || [], today, "days"), [records, today])
  const stats = useMemo(() => source === "all" ? all : dashboardStats(records || [], today, "days", source), [all, records, today, source])
  const calendar = useMemo(() => applicationCalendar(records || [], month, today, source), [records, month, today, source])
  const scope = source === "all" ? "전체" : applicationPathLabel(source)
  const color = source === "all" ? "var(--accent)" : sourceColor(source)
  let offset = 0
  const gradient = all.sources.filter(item => item.count).map(item => {
    const start = offset
    offset += item.count / all.total * 100
    const fill = source === "all" || source === item.platform ? sourceColor(item.platform) : "var(--border)"
    return `${fill} ${start}% ${offset}%`
  }).join(", ")
  return <div className="dashboard-analytics" aria-busy={!records} style={{ "--chart-color": color } as CSSProperties}>
    <section className="analytics-panel source-panel" aria-labelledby="source-chart-title">
      <div className="analytics-heading"><h2 id="source-chart-title">지원 경로별 비율</h2><button className="chart-reset" aria-pressed={source === "all"} onClick={() => onSource("all")}>전체 보기</button></div>
      <div className="source-chart-content">
        <div className="source-donut" role="img" aria-label={`전체 지원 ${all.total}건. ${all.sources.map(item => `${applicationPathLabel(item.platform)} ${item.count}건 ${sharePercent(item.count, all.total)}%`).join(", ")}`}
          style={{ background: gradient ? `conic-gradient(${gradient})` : "var(--border)" }}>
          <span><small>{source === "all" ? "전체 지원" : scope}</small><strong>{records ? stats.total.toLocaleString() : "—"}<em>건</em></strong></span>
        </div>
        <ul className="source-chart-legend">{all.sources.map(item => <li key={item.platform}>
          <button onClick={() => onSource(source === item.platform ? "all" : item.platform)} aria-label={`${applicationPathLabel(item.platform)} 통계 보기`} aria-pressed={source === item.platform}>
            <span className="source-label">{sourceBrand(item.platform) && <img className="platform-symbol" src={sourceBrand(item.platform)!.symbol} alt="" width={20} height={20} />}{applicationPathLabel(item.platform)}</span><strong>{item.count}<small>건</small></strong><b>{sharePercent(item.count, all.total)}%</b>
          </button>
        </li>)}</ul>
        {records && !all.total && <p className="source-chart-empty">지원 기록을 추가하면 경로별 비율이 표시됩니다.</p>}
      </div>
    </section>
    <ApplicationCalendar data={calendar} month={month} today={today} source={source} onMonth={setMonth} />
    <div className="dashboard-side-column"><section className="analytics-panel weekday-panel" aria-labelledby="weekday-chart-title">
      <div className="analytics-heading"><div><h2 id="weekday-chart-title">요일별 지원 분포</h2><p>{scope} · {month.replace("-", ".")} · {calendar.total}건</p></div></div>
      <ActivityChart bins={calendar.weekdays} total={calendar.total} label="요일별 지원 수" />
      <p className="analytics-footnote">지원일만 사용하며 이력서 작성일과 수집일은 포함하지 않습니다.</p>
    </section>
    <DashboardEncouragement /></div>
  </div>
}

function ActivityChart({ bins, total, label, dense = false }: { bins: { key: string; label: string; count: number }[]; total: number; label: string; dense?: boolean }) {
  const [pinned, setPinned] = useState<string>()
  const ceiling = Math.max(2, Math.ceil(Math.max(...bins.map(bin => bin.count)) / 2) * 2)
  return <div className={`activity-chart${dense ? " dense" : ""}`} role="group" aria-label={label}>
    <div className="chart-axis" aria-hidden="true"><span>{ceiling}</span><span>{ceiling / 2}</span><span>0</span></div>
    <div className="activity-plot" style={{ "--chart-columns": bins.length } as CSSProperties}>
      {bins.map((bin, index) => <div className="activity-column" key={bin.key}>
        <button className="activity-bar" data-pinned={pinned === bin.key} aria-label={`${bin.key} 지원 ${bin.count}건, 기간 내 ${sharePercent(bin.count, total)}%`}
          onClick={() => setPinned(current => current === bin.key ? undefined : bin.key)} onBlur={() => setPinned(undefined)}>
          <span className="activity-fill" style={{ height: `${bin.count / ceiling * 100}%` }} />
          <span className="chart-tooltip">{bin.key} · {bin.count}건 · {sharePercent(bin.count, total)}%</span>
        </button>
        <span className="activity-label">{!dense || (index % 7 === 0 && index < bins.length - 3) || index === bins.length - 1 ? bin.label : ""}</span>
      </div>)}
    </div>
  </div>
}
