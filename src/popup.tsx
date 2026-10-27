import React, { useEffect, useRef, useState } from "react"
import { Brand, Icon, Notice, PlatformTag, Sentences } from "./ui/components"
import { download, formatTime, pageCommand, type Snapshot } from "./ui/client"
import { rpc } from "./messaging/protocol"
import { applicationSources, platformLabel, recordDateLabel, recordStatusLabel, type PageState } from "./core/model"
import { platformIds } from "./core/platforms"
import { platformForUrl } from "./core/urls"
import { HistoryTask, openManagement } from "./ui/platform-links"
import { useTheme } from "./ui/theme"
import { HistoryRunStatus } from "./ui/history-run-status"
import { SubmissionActivity } from "./ui/submission-activity"
import { compareApplicationRecords } from "./core/record-order"
import { CommunityLink } from "./ui/community-link"
import "./style.css"

function Popup() {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [page, setPage] = useState<PageState>()
  const [tabId, setTabId] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const activeTab = useRef<number>()
  useTheme(snapshot?.settings.theme)

  async function load() {
    setSnapshot(await rpc({ type: "snapshot" }))
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id && tab.url && platformForUrl(tab.url)) {
      setTabId(tab.id)
      activeTab.current = tab.id
      try { setPage(await pageCommand(tab.id, "GET_PAGE")) }
      catch { setPage({ platform: platformForUrl(tab.url), kind: "other", matches: 0, message: "페이지를 새로고침한 뒤 다시 확인해 주세요." }) }
    } else { setPage(undefined); setTabId(undefined); activeTab.current = undefined }
  }
  useEffect(() => {
    void load().catch(e => setError(e.message))
    const changed = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.settings || changes.revision || changes.reports || changes.historyRun || changes.historyCompletions || changes.submissionAttempts) {
        void rpc({ type: "snapshot" }).then(setSnapshot).catch(e => setError(e.message))
        if (activeTab.current) void pageCommand(activeTab.current, "GET_PAGE").then(setPage).catch(() => undefined)
      }
    }
    chrome.storage.onChanged.addListener(changed)
    return () => chrome.storage.onChanged.removeListener(changed)
  }, [])

  async function runSync() {
    if (!tabId) return
    setBusy(true); setError(""); setNotice("")
    try {
      const report = await pageCommand(tabId, "SYNC_PAGE")
      if (["selectors_unverified", "dom_changed", "login_required", "error"].includes(report.code)) setError(report.message)
      else setNotice(report.code === "loading" ? report.message : `${report.inserted}건 추가 · ${report.updated}건 갱신. ${report.message}`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : "지원 내역을 가져오지 못했습니다.") }
    finally { setBusy(false) }
  }
  async function runAll() {
    if (!tabId) return
    setBusy(true); setError(""); setNotice("")
    try { await rpc({ type: "history_run", operation: "start", tabId }); await load() }
    catch (e) { setError(e instanceof Error ? e.message : "수집을 시작하지 못했습니다.") }
    finally { setBusy(false) }
  }

  const records = snapshot?.records || []
  const recordedSources = applicationSources.map(source => ({ source, count: records.filter(record => record.platform === source).length })).filter(item => item.count > 0)
  const recent = records.filter(record => snapshot?.settings.showCancelled || record.status !== "cancelled")
    .sort(compareApplicationRecords).slice(0, 3)
  const last = Object.values(snapshot?.reports || {}).sort((a, b) => b.at.localeCompare(a.at))[0]
  const enabled = page?.platform && snapshot?.settings.consent[page.platform]
  const isHistory = page?.kind === "history"
  const pageTitle = isHistory ? "지원 현황" : page?.kind === "detail" ? "공고 상세" : page?.kind === "listing" ? "채용공고 목록" : "현재 사이트"
  const run = snapshot?.historyRun
  const collecting = run?.status === "running"
  const collectingHere = collecting && run.tabId === tabId
  const waiting = page?.collectionCode === "loading"

  return <main className="popup" aria-busy={busy}>
    <header className="popup-header">
      <Brand />
      <button className="icon-btn" aria-label="설정 열기" onClick={() => void openManagement("settings")}><Icon name="settings" size={19} /></button>
    </header>

    <section className="popup-summary" aria-label="지원 기록 요약">
      <div className="section-label"><h1>지원 기록</h1><button className="btn dashboard-button" onClick={() => void openManagement("overview")}><Icon name="grid" size={14} />대시보드 열기 <Icon name="arrow" size={14} /></button></div>
      <div className="popup-total"><div className="popup-number">{records.length.toLocaleString()}<span>건</span></div><button className="btn primary" onClick={() => void openManagement("add")}>+ 직접 추가</button></div>
      {recordedSources.length > 0 && <>
        <div className="popup-metrics-heading"><span>지원 경로별</span><span>{recordedSources.length}개 경로</span></div>
        <dl className="popup-metrics" aria-label="지원 경로별 기록 수" tabIndex={recordedSources.length > 6 ? 0 : undefined}>
          {recordedSources.map(({ source, count }) => <div key={source}><dt title={platformLabel[source]}>{platformLabel[source]}</dt><dd><strong>{count.toLocaleString()}</strong><span>건</span></dd></div>)}
        </dl>
        {recordedSources.length > 6 && <p className="popup-metrics-hint">목록을 스크롤해 다른 지원 경로도 확인하세요.</p>}
      </>}
    </section>

    <SubmissionActivity attempts={snapshot?.submissionAttempts} records={records} onEdit={() => void openManagement("overview")} onAdd={() => void openManagement("add")} />
    {page?.platform && <section className={`popup-context ${page.matches ? "has-match" : ""}`}>
      <div className="context-label"><PlatformTag platform={page.platform} /><span>{pageTitle}</span></div>
      <strong className="context-title">{(waiting || collectingHere) && <span className="collection-spinner" aria-hidden="true" />}{page.matches ? `지원 이력이 있는 공고 ${page.matches}개` : isHistory ? collectingHere ? "지원 기록 가져오는 중" : waiting ? "지원 목록 불러오는 중" : "지원 현황에서 가져오기" : "저장된 기록과 비교"}</strong>
      <p><Sentences>{isHistory && !enabled ? "이 사이트의 수집이 꺼져 있습니다. 설정에서 다시 켤 수 있습니다." : isHistory && collectingHere ? run.message : isHistory && !page.profileReady ? "지원 현황을 감지했습니다. 실제 목록을 읽는 기능은 화면 검증이 필요합니다." : page.message}</Sentences></p>
      {isHistory && enabled && page.profileReady && <button className="btn primary" disabled={busy || collecting} onClick={() => void runAll()}><Icon name="download" size={15} />{collecting ? "페이지를 순서대로 가져오는 중…" : "조회 기간 전체 가져오기"}</button>}
      {isHistory && <button className="btn" disabled={busy || collecting || waiting} onClick={() => {
        if (!page.profileReady || !enabled) void openManagement("settings")
        else void runSync()
      }}><Icon name={page.profileReady && enabled ? "refresh" : "settings"} size={15} />{waiting ? "목록이 나타나기를 기다리는 중…" : busy ? "가져오는 중…" : !enabled ? "수집 설정" : !page.profileReady ? "수집 상태 확인" : "현재 목록 가져오기"}</button>}
      {isHistory && <p className="collection-help">사이트에 설정한 기간과 필터를 유지하며 첫 페이지부터 읽습니다.</p>}
      {page.hasNextPage && tabId && <button className="text-btn" onClick={() => void pageCommand(tabId, "NEXT_PAGE").then(() => window.close()).catch(e => setError(e.message))}>다음 페이지 열기 <Icon name="arrow" size={14} /></button>}
      {isHistory && tabId && <button className="text-btn" onClick={() => void pageCommand(tabId, "HISTORY_DIAGNOSTICS").then(data => {
        download(`오늘시작-${page.platform}-화면진단.json`, JSON.stringify(data, null, 2), "application/json")
        setNotice("텍스트와 개인정보를 제거한 화면 구조를 저장했습니다.")
      }).catch(e => setError(e.message))}>화면 진단 파일 저장 <Icon name="download" size={14} /></button>}
    </section>}

    <HistoryRunStatus run={run} />

    <section className="popup-sites">
      <h2>지원 내역 가져오기</h2>
      <p className="section-description">아래 항목을 눌러 사이트별 수집을 시작하세요.</p>
      <ol className="history-tasks">{platformIds.map(platform => <li key={platform}>
        <HistoryTask platform={platform} count={records.filter(record => record.platform === platform).length} enabled={snapshot?.settings.consent[platform] !== false} completed={!!snapshot?.historyCompletions?.[platform]} />
      </li>)}</ol>
    </section>

    <section className="popup-recent">
      <div className="section-label"><h2>최근 지원 기록</h2>{recent.length > 0 && <span className="muted small">최근 {recent.length}건</span>}</div>
      {recent.length ? <div className="recent-list">{recent.map(record => <button className="recent-record" key={record.id} onClick={() => void openManagement("records")}>
        <div><strong>{record.companyName}</strong><span>{record.jobTitle}</span></div>
        <div className="recent-meta"><span>{recordDateLabel(record)}</span><span>{recordStatusLabel(record)}</span></div>
      </button>)}</div> : <div className="popup-empty"><Icon name="list" size={19} /><span>저장된 지원 기록이 없습니다.</span></div>}
    </section>

    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    <div className="popup-actions"><button className="btn popup-manage" onClick={() => void openManagement("records")}>지원 기록 관리 <Icon name="arrow" size={15} /></button></div>
    <footer className="popup-footer"><span>{last ? `최근 수집 ${formatTime(last.at)}` : "수집 이력 없음"}</span><CommunityLink /></footer>
  </main>
}
export default Popup
