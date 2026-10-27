import React, { useState } from "react"
import { platformLabel, type ApplicationRecord, type Platform, type SyncReport } from "../core/model"
import type { HistoryRun } from "../collection/history-run-model"
import type { HistoryCompletions } from "../storage/history-completions"
import { platformDefinitions, platformIds } from "../core/platforms"
import { Icon } from "./components"
import { useHistoryImport } from "./platform-links"
import { PlatformSymbol } from "./platform-logo"
import { formatTime } from "./client"
import { historyRunNotice } from "./history-run-notice"

interface ImportProps {
  ready: boolean
  records?: ApplicationRecord[]
  consent?: Partial<Record<Platform, boolean>>
  reports?: Partial<Record<Platform, SyncReport>>
  completions?: HistoryCompletions
  run?: HistoryRun
}

interface ImportNotice { title: string; message: string; retry?: boolean; warning?: boolean }

function importNotice(report?: SyncReport): ImportNotice | undefined {
  switch (report?.code) {
    case "login_required": return { title: "로그인 필요", message: "사이트에 로그인한 뒤 ‘다시 가져오기’를 눌러 주세요.", retry: true, warning: true }
    case "selectors_unverified":
    case "dom_changed": return { title: "지원 목록을 읽지 못했어요", message: "사이트의 지원 목록이 모두 표시된 뒤 다시 가져와 주세요. 계속 안 되면 직접 추가할 수 있어요.", retry: true, warning: true }
    case "partial": return { title: "일부 기록만 가져왔어요", message: `${report.skipped > 0 ? `${report.skipped.toLocaleString()}건을` : "일부 내역을"} 읽지 못했어요. 다시 가져와도 같다면 직접 추가해 주세요.`, retry: true, warning: true }
    case "error": return { title: "가져오지 못했어요", message: "가져오는 중 오류가 발생했어요. ‘다시 가져오기’를 눌러 주세요.", retry: true, warning: true }
    case "loading": return { title: "지원 목록 로딩 중", message: "사이트의 지원 목록이 모두 표시된 뒤 다시 가져와 주세요.", retry: true }
    case "empty": return { title: "조회한 기간에 지원 내역이 없어요", message: "다른 기간의 기록은 사이트에서 조회 기간을 변경한 뒤 가져올 수 있어요." }
  }
}

function ImportSite({ platform, count, enabled, ready, report, completedAt, run }: { platform: Platform; count: number; enabled: boolean; ready: boolean; report?: SyncReport; completedAt?: string; run?: HistoryRun }) {
  const busy = !ready || run?.status === "running"
  const collecting = run?.status === "running" && run.platform === platform
  const { starting, error, start } = useHistoryImport({ platform, enabled, busy })
  const latestReport = report && (!completedAt || report.at > completedAt) ? report : undefined
  const latestRun = run?.platform === platform && run.status !== "running" && (!completedAt || run.updatedAt > completedAt) && (!report || run.updatedAt >= report.at) ? run : undefined
  const runNotice = latestRun && historyRunNotice(latestRun)
  const notice: ImportNotice | undefined = !enabled ? { title: "가져오기 꺼짐", message: "설정에서 이 사이트의 수집을 켜면 가져올 수 있어요." } : collecting || starting ? undefined : runNotice && latestRun?.status !== "completed" ? { title: runNotice.title.replace(`${platformLabel[platform]} · `, ""), message: runNotice.message, retry: true, warning: runNotice.tone === "warning" } : importNotice(latestReport)
  const importedAt = [completedAt, report && ["ok", "partial", "empty"].includes(report.code) ? report.at : undefined].filter((value): value is string => !!value).sort().pop()
  const action = !enabled ? "설정 열기" : notice?.retry ? "다시 가져오기" : "가져오기"
  const visibleNotice: ImportNotice | undefined = error ? { title: "시작하지 못했어요", message: error, warning: true } : notice
  return <li className={`record-import-site${collecting ? " is-collecting" : ""}`}>
    <div className="record-import-site-main">
      <PlatformSymbol platform={platform} />
      <div className="import-source-copy"><strong>{platformLabel[platform]}{completedAt && !notice && <span className="record-import-completed" title="전체 가져오기 완료 이력 있음"><Icon name="check" size={12} /></span>}</strong><span className="import-source-detail">{!ready ? "불러오는 중…" : <><b>{count.toLocaleString()}</b>건 저장{importedAt && <span className="record-import-date">최근 {formatTime(importedAt)}</span>}</>}</span></div>
      <button type="button" className="btn history-import-button" disabled={starting || busy} aria-label={`${platformLabel[platform]} ${enabled ? "지원 기록 가져오기" : "수집 설정 열기"}`} aria-busy={starting || collecting} onClick={event => void start(event)}>{starting || collecting ? <><span className="collection-spinner" aria-hidden="true" />가져오는 중…</> : <>{action}<Icon name={enabled ? "download" : "settings"} size={13} /></>}</button>
    </div>
    <div className="record-import-status">
      {visibleNotice ? <details key={`${visibleNotice.title}:${visibleNotice.message}`} className={`record-import-notice${visibleNotice.warning ? " warning" : ""}`}>
        <summary aria-label={`${platformLabel[platform]} ${visibleNotice.title} 자세히 보기`}><strong title={visibleNotice.title}>{visibleNotice.title}</strong><span className="record-import-notice-toggle"><span className="notice-show">자세히</span><span className="notice-hide">접기</span><Icon name="arrow" size={12} /></span></summary>
        <p>{visibleNotice.message}</p>
      </details> : <p className="record-import-status-note">{collecting || starting ? "지원 내역을 저장하고 있어요." : count > 0 ? "새로운 지원 내역을 가져올 수 있어요." : "아직 가져온 기록이 없어요."}</p>}
    </div>
  </li>
}

export function RecordImports({ ready, records = [], consent, reports, completions, run }: ImportProps) {
  const [query, setQuery] = useState("")
  const [savedOnly, setSavedOnly] = useState(false)
  const counts = Object.fromEntries(platformIds.map(platform => [platform, records.filter(record => record.platform === platform).length])) as Record<Platform, number>
  const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "")
  const sites = platformIds.filter(platform => (!savedOnly || counts[platform] > 0) && normalized(`${platformLabel[platform]} ${platformDefinitions[platform].host}`).includes(normalized(query)))
  const savedSites = platformIds.filter(platform => counts[platform] > 0).length
  return <section className="card records-imports" aria-labelledby="records-imports-title">
    <div className="records-imports-header">
      <span className="import-heading-icon" aria-hidden="true"><Icon name="download" size={19} /></span>
      <div className="records-imports-intro"><h2 id="records-imports-title">지원 내역 가져오기</h2><span>이용하는 사이트에서 지원 기록을 모아 보세요.</span></div>
      <span className="record-import-site-count">지원 사이트 {platformIds.length}개</span>
    </div>
    <div className="records-imports-body">
      <p className="import-description">‘가져오기’를 누르면 해당 사이트를 새 탭으로 열고 지원 기록을 저장해요. 먼저 사이트에 로그인해 주세요.</p>
      <div className="record-import-tools"><div className="record-import-filters" role="group" aria-label="가져오기 사이트 필터"><button type="button" aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)}>전체 <span>{platformIds.length}</span></button><button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly(true)}>기록 있는 사이트 <span>{savedSites}</span></button></div><label className="search-box record-import-search"><Icon name="search" size={15} /><input type="search" placeholder="사이트 이름 검색" aria-label="가져오기 사이트 검색" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      {run?.status === "running" && <p className="record-import-running" role="status"><span className="collection-spinner" aria-hidden="true" />{platformLabel[run.platform]}에서 가져오는 중이에요. 끝나면 다른 사이트도 가져올 수 있어요.</p>}
      <span className="record-import-result" role="status">{query || savedOnly ? `${sites.length}개 사이트 표시` : ""}</span>
      {sites.length ? <ul className="source-imports record-import-list" aria-label="사이트별 기록 가져오기" tabIndex={sites.length > 6 ? 0 : undefined}>{sites.map(platform => <ImportSite key={platform} platform={platform} ready={ready} enabled={consent?.[platform] !== false} count={counts[platform]} report={reports?.[platform]} completedAt={completions?.[platform]} run={run} />)}</ul> : <div className="record-import-empty"><strong>{query ? "일치하는 사이트가 없어요" : "아직 가져온 기록이 있는 사이트가 없어요"}</strong><p>{query ? "다른 사이트 이름으로 검색해 주세요." : "전체 목록에서 이용하는 사이트의 ‘가져오기’를 눌러 보세요."}</p><button type="button" className="text-btn" onClick={() => { setQuery(""); setSavedOnly(false) }}>전체 사이트 보기<Icon name="arrow" size={13} /></button></div>}
      <div className="record-import-footer"><p className="import-footnote"><Icon name="check" size={13} />이미 가져온 기록은 중복 저장하지 않아요.</p><details className="record-import-help"><summary>가져오는 범위 안내</summary><p>사이트에서 현재 조회 중인 기간의 지원 내역을 가져와요. 다른 기간을 가져오려면 새 탭에서 조회 기간을 바꾸고, 오늘시작 팝업의 ‘조회 기간 전체 가져오기’를 눌러 주세요. 기존에 저장한 기록은 유지돼요.</p></details></div>
    </div>
  </section>
}
