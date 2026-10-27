import React, { useEffect, useMemo, useRef, useState } from "react"
import { Brand, Icon, Notice, Toggle, Sentences } from "./ui/components"
import { download, formatTime, toCsv, type Snapshot } from "./ui/client"
import { RecordTable } from "./ui/record-table"
import { useTheme } from "./ui/theme"
import { HistoryRunStatus } from "./ui/history-run-status"
import { rpc } from "./messaging/protocol"
import { platformLabel, statusLabel, applicationSources, requiresStatusReview, type ApplicationRecord, type ApplicationStatus, type ApplicationSource } from "./core/model"
import { compareApplicationRecords, compareRecordsByColumn, type RecordSort, type RecordSortKey } from "./core/record-order"
import { RecordReviewPanel } from "./ui/record-review-panel"
import { platformIds } from "./core/platforms"
import { ManualApplicationForm } from "./ui/manual-application-form"
import { DashboardSummary } from "./ui/dashboard-summary"
import { DashboardHero } from "./ui/dashboard-hero"
import { DashboardAnalytics } from "./ui/dashboard-analytics"
import { DashboardImports } from "./ui/dashboard-imports"
import { RecordImports } from "./ui/record-imports"
import { applicationPath, type ApplicationPath } from "./core/application-path"
import { ResetDataDialog } from "./ui/reset-data-dialog"
import { SubmissionActivity } from "./ui/submission-activity"
import { normalizeCompanyName } from "./core/company"
import { validateProfile } from "./platforms/profile"
import { collectionPolicy } from "./collection/policy"
import type { Settings } from "./storage/settings"
import { CareerCalendar } from "./ui/career-calendar"
import { NotesPage } from "./ui/notes-page"
import { NoteEditor } from "./ui/note-editor"
import { EventEditor } from "./ui/event-editor"
import { RecordDetails } from "./ui/record-details"
import { UpcomingEvents } from "./ui/upcoming-events"
import { CommunityLink } from "./ui/community-link"
import { StoreReview } from "./ui/store-review"
import { LocalDataInfo } from "./ui/local-data-info"
import { PlatformSymbol } from "./ui/platform-logo"
import { linkedRecord } from "./ui/planner-components"
import { noteCountsByRecord } from "./core/planner-lookups"
import type { Note, NoteDraft, CareerEvent, EventDraft } from "./core/planner"
import { draftsChanged, readPlannerDrafts, removePlannerDraft, syncDraftGeneration, type PlannerDraft } from "./ui/planner-drafts"
import "./style.css"
import "./ui/planner.css"
import "./ui/note-board.css"

type View = "overview" | "records" | "calendar" | "notes" | "settings"
function viewFromHash(): View {
  const view = location.hash.slice(1)
  return view === "add" ? "records" : view === "records" || view === "calendar" || view === "notes" || view === "settings" ? view : "overview"
}

function Options() {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [view, setView] = useState<View>(viewFromHash)
  const [query, setQuery] = useState("")
  const [platform, setPlatform] = useState<ApplicationSource | "all">("all")
  const [dashboardSource, setDashboardSource] = useState<ApplicationPath | "all">("all")
  const [adding, setAdding] = useState(location.hash === "#add")
  const [sort, setSort] = useState<RecordSort>({ key: "appliedAt", direction: "descending" })
  const [reviewOnly, setReviewOnly] = useState(false)
  const [editingReview, setEditingReview] = useState(false)
  const [editingStatus, setEditingStatus] = useState(false)
  const statusInput = useRef<HTMLSelectElement>(null)
  const reviewPanel = useRef<HTMLDivElement>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [editing, setEditing] = useState<ApplicationRecord>()
  useEffect(() => { if (editingStatus) statusInput.current?.focus() }, [editing?.id, editingStatus])
  const [deleting, setDeleting] = useState<ApplicationRecord>()
  const [deleteLinked, setDeleteLinked] = useState(false)
  const [detail, setDetail] = useState<string>()
  const [noteEditor, setNoteEditor] = useState<{ initial: NoteDraft; recovered?: PlannerDraft; returnLinkId?: string; initialMenu?: boolean; activeId?: string }>()
  const [eventEditor, setEventEditor] = useState<{ initial: EventDraft; recovered?: PlannerDraft; returnLinkId?: string }>()
  const [drafts, setDrafts] = useState<PlannerDraft[]>([])
  const draftGeneration = useRef<string>()
  const [busy, setBusy] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState("")
  const backupInput = useRef<HTMLInputElement>(null)
  const profileInput = useRef<HTMLInputElement>(null)
  useTheme(snapshot?.settings.theme)

  async function load() {
    const next = await rpc<Snapshot>({ type: "snapshot" })
    if (draftGeneration.current !== next.dataGeneration) { setNoteEditor(undefined); setEventEditor(undefined); setDetail(undefined) }
    draftGeneration.current = next.dataGeneration
    syncDraftGeneration(next.dataGeneration)
    setDrafts(readPlannerDrafts(next.dataGeneration)); setSnapshot(next)
  }
  async function loadPlanner() {
    const next = await rpc<Pick<Snapshot, "planner" | "dataGeneration">>({ type: "planner_snapshot" })
    if (draftGeneration.current !== next.dataGeneration) { await load(); return }
    setSnapshot(current => current && current.dataGeneration === next.dataGeneration ? { ...current, planner: next.planner } : current)
  }
  useEffect(() => {
    void load().catch(e => setError(e.message))
    const changed = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.revision || changes.settings || changes.reports || changes.historyRun || changes.historyCompletions || changes.submissionAttempts) void load().catch(e => setError(e.message))
      else if (changes.plannerRevision) void loadPlanner().catch(e => setError(e.message))
    }
    const navigate = () => { setView(viewFromHash()); if (viewFromHash() !== "notes") setNoteEditor(undefined); if (location.hash === "#add") setAdding(true) }
    const refreshDrafts = () => setDrafts(readPlannerDrafts(draftGeneration.current))
    chrome.storage.onChanged.addListener(changed)
    window.addEventListener("hashchange", navigate)
    window.addEventListener(draftsChanged, refreshDrafts)
    window.addEventListener("storage", refreshDrafts)
    return () => { chrome.storage.onChanged.removeListener(changed); window.removeEventListener("hashchange", navigate); window.removeEventListener(draftsChanged, refreshDrafts); window.removeEventListener("storage", refreshDrafts) }
  }, [])
  function navigate(next: View) { if (next !== "notes") setNoteEditor(undefined); setView(next); history.replaceState(null, "", "#" + next) }
  async function action(callback: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("")
    try { await callback(); await load() }
    catch (e) { setError(e instanceof Error ? e.message : "요청을 처리하지 못했습니다.") }
    finally { setBusy(false) }
  }
  async function updateSettings(settings: Settings) {
    await rpc({ type: "settings", settings })
    setSnapshot(current => current && { ...current, settings })
  }

  async function resetData() {
    setBusy(true); setResetError(""); setError(""); setNotice("")
    try {
      await rpc({ type: "reset_data" })
      await load()
      setQuery(""); setPlatform("all"); setDashboardSource("all"); setReviewOnly(false)
      setDetail(undefined)
      setResetting(false); setNotice("지원 데이터를 초기화했습니다.")
    } catch (error) { setResetError(error instanceof Error ? error.message : "초기화하지 못했습니다. 다시 시도해 주세요.") }
    finally { setBusy(false) }
  }

  const records = snapshot?.records || []
  const planner = snapshot?.planner || { links: [], notes: [], events: [] }
  const activeDashboardSource = dashboardSource !== "all" && snapshot && !snapshot.records.some(record => record.status === "applied" && applicationPath(record) === dashboardSource) ? "all" : dashboardSource
  const dashboardRecords = activeDashboardSource === "all" ? snapshot?.records : snapshot?.records.filter(record => applicationPath(record) === activeDashboardSource)
  const settings = snapshot?.settings
  const reviewRecords = useMemo(() => records.filter(requiresStatusReview).sort(compareApplicationRecords), [records])
  const filtered = useMemo(() => {
    const normalizedQuery = normalizeCompanyName(query), lowerQuery = query.toLocaleLowerCase()
    return records.filter(record => (platform === "all" || record.platform === platform) &&
    (!reviewOnly || requiresStatusReview(record)) &&
    (settings?.showCancelled || record.status !== "cancelled") &&
    (!query || normalizeCompanyName(record.companyName).includes(normalizedQuery) || record.jobTitle.toLocaleLowerCase().includes(lowerQuery)))
    .sort((a, b) => compareRecordsByColumn(a, b, sort))
  }, [records, platform, reviewOnly, settings?.showCancelled, query, sort])
  const counts = useMemo(() => {
    const result = Object.fromEntries(applicationSources.map(source => [source, 0])) as Record<ApplicationSource, number>
    for (const record of records) result[record.platform]++
    return result
  }, [records])
  const noteCounts = useMemo(() => noteCountsByRecord(planner.links, planner.notes), [planner.links, planner.notes])
  const lastReport = Object.values(snapshot?.reports || {}).sort((a, b) => b.at.localeCompare(a.at))[0]
  function openReview() {
    if (view === "records" && reviewOnly) { setReviewOnly(false); return }
    navigate("records"); setReviewOnly(true); setPlatform("all"); setQuery("")
    requestAnimationFrame(() => reviewPanel.current?.scrollIntoView({ block: "start", behavior: "auto" }))
  }
  function sortByColumn(key: RecordSortKey) {
    setSort(current => ({ key, direction: current.key === key ? current.direction === "ascending" ? "descending" : "ascending" : key === "appliedAt" ? "descending" : "ascending" }))
  }
  function editRecord(record: ApplicationRecord, review = false, status = false) { setEditing(record); setEditingReview(review); setEditingStatus(status) }
  function openNote(note?: Note, linkId?: string, returnLinkId?: string, initialMenu = false) {
    const initial: NoteDraft = note ? { id: note.id, expectedRevision: note.revision, title: note.title, body: note.body, checklist: note.checklist, pinned: note.pinned, linkId: note.linkId, color: note.color, mentions: note.mentions } : { id: crypto.randomUUID(), expectedRevision: 0, title: "", body: "", checklist: [], pinned: false, linkId, color: "yellow", mentions: [] }
    const recovered = readPlannerDrafts(snapshot?.dataGeneration).find((item): item is Extract<PlannerDraft, { kind: "note" }> => item.kind === "note" && (note ? item.value.id === note.id : item.value.expectedRevision === 0 && item.value.id !== noteEditor?.initial.id && item.value.linkId === linkId))
    setDetail(undefined); navigate("notes"); setNoteEditor({ initial: recovered?.value || initial, recovered, returnLinkId, initialMenu })
  }
  function openEvent(event?: CareerEvent, date?: string, linkId?: string, returnLinkId?: string) {
    const record = linkedRecord(linkId, records, planner.links)
    const initial: EventDraft = event ? { id: event.id, expectedRevision: event.revision, title: event.title, kind: event.kind, status: event.status, date: event.date, time: event.time, location: event.location, url: event.url, body: event.body, checklist: event.checklist, linkId: event.linkId } : { id: crypto.randomUUID(), expectedRevision: 0, title: record ? `${record.companyName} 면접` : "", kind: record ? "interview" : "other", status: "planned", date: date || new Date(Date.now() + 9 * 3600000).toISOString().slice(0,10), location: "", body: "", checklist: [], linkId }
    const recovered = readPlannerDrafts(snapshot?.dataGeneration).find((item): item is Extract<PlannerDraft, { kind: "event" }> => item.kind === "event" && (event ? item.value.id === event.id : item.value.expectedRevision === 0 && item.value.linkId === linkId && (!date || item.value.date === date)))
    setDetail(undefined); setEventEditor({ initial: recovered?.value || initial, recovered, returnLinkId })
  }
  function resumeDraft(draft: PlannerDraft) {
    setDetail(undefined)
    if (draft.kind === "note") { navigate("notes"); setNoteEditor({ initial: draft.value, recovered: draft }) }
    else setEventEditor({ initial: draft.value, recovered: draft })
  }
  async function saveEditing(next = false) {
    if (!editing) return
    const current = editing, following = next ? reviewRecords.find(record => record.id !== current.id) : undefined
    await action(async () => {
      await rpc({ type: "edit", id: current.id, changes: { companyName: current.companyName, jobTitle: current.jobTitle, appliedAt: current.appliedAt || undefined, status: current.status } })
      setEditing(following); setEditingReview(!!following); setNotice("기록을 수정했습니다.")
    })
  }
  const reviewButton = (reviewRecords.length > 0 || view === "records" && reviewOnly) && <button className="btn review-button" aria-pressed={view === "records" && reviewOnly} onClick={openReview}><span className="review-alert" aria-hidden="true">!</span>상태 확인 {reviewRecords.length}</button>

  async function importFile(file: File | undefined, kind: "backup" | "profile") {
    if (!file) return
    await action(async () => {
      if (file.size > collectionPolicy.maxImportBytes) throw new Error("파일은 20MB 이하여야 합니다.")
      const value: unknown = JSON.parse((await file.text()).replace(/^\uFEFF/, ""))
      if (kind === "backup") {
        const result = await rpc<{ inserted: number; updated: number; notes?: number; events?: number }>({ type: "restore", backup: value })
        setNotice(`백업 복원 완료 · ${result.inserted}건 추가 · ${result.updated}건 갱신${result.notes || result.events ? ` · 메모 ${result.notes || 0}건 · 일정 ${result.events || 0}건` : ""}`)
      } else {
        if (!settings) throw new Error("설정을 불러오는 중입니다.")
        const profile = validateProfile(value)
        await updateSettings({ ...settings, profiles: { ...settings.profiles, [profile.platform]: profile } })
        setNotice(`${platformLabel[profile.platform]} 화면 설정을 등록했습니다. 해당 사이트를 새로고침해 주세요.`)
      }
    })
  }
  const viewLabel = ({ overview: "대시보드", records: "지원 기록", calendar: "취업 캘린더", notes: "메모", settings: "설정" } as const)[view]
  const title = view === "overview" ? "지원 현황" : viewLabel

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand /><div className="nav-label">워크스페이스</div>
      <nav aria-label="주 메뉴">{([
        { id: "overview", label: "대시보드", icon: "grid" },
        { id: "records", label: "지원 기록", icon: "list" },
        { id: "calendar", label: "취업 캘린더", icon: "calendar" },
        { id: "notes", label: "메모", icon: "note" },
        { id: "settings", label: "설정", icon: "settings" }
      ] as const).map(item => <button key={item.id} className={`nav-item${item.id === "settings" ? " nav-item-settings" : ""}${view === item.id ? " active" : ""}`} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}>
        <Icon name={item.icon} size={17} />{item.label}{item.id === "records" && <span className="nav-count">{records.length}</span>}
      </button>)}</nav>
    </aside>

    <main className={`workspace${view === "settings" ? " settings-workspace" : ""}`} aria-busy={busy}>
      {view !== "overview" && <div className="topbar"><span>워크스페이스 / {viewLabel}</span></div>}
      <div className={`page-heading${view === "overview" ? " dashboard-heading" : ""}`}>
        {view === "overview" ? <DashboardHero /> : <div><h1>{title}</h1><p>{view === "settings" ? "화면, 수집 방식과 내 데이터를 관리해요." : view === "calendar" ? "다가오는 면접과 마감일, 준비할 일을 챙겨요." : view === "notes" ? "기업 조사부터 면접 복기까지, 기억할 내용을 모아요." : "기업과 직무로 검색하고 지원 기록을 관리합니다."}</p></div>}
        {view === "settings" && <span className="settings-save-hint"><Icon name="check" size={13} />변경 사항은 자동으로 저장돼요</span>}
        {view === "notes" && <button className="btn primary" disabled={!snapshot} onClick={() => openNote()}>+ 메모 작성</button>}
        {view === "overview" && <div className="heading-actions">{reviewButton}<button className="btn" onClick={() => navigate("records")}>지원 기록 관리<Icon name="arrow" size={15} /></button></div>}
        {view === "records" && <div className="heading-actions">
          {reviewButton}
          <button className="btn primary" onClick={() => setAdding(true)}>+ 직접 추가</button>
          <button className="btn" disabled={busy || !snapshot} onClick={() => download(`오늘시작-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(filtered), "text/csv;charset=utf-8")}><Icon name="download" size={15} />CSV 내보내기</button>
        </div>}
      </div>
      {error && <div className="toast"><Notice error>{error}</Notice></div>}
      {notice && <div className="toast"><Notice>{notice}</Notice></div>}
      {!noteEditor && !eventEditor && drafts.length > 0 && <section className="planner-recovery" aria-label="임시 저장한 작성 내용"><h2>이어서 작성해요</h2>{drafts.map(draft => <div key={draft.key}><button className="text-btn" onClick={() => resumeDraft(draft)}>{draft.kind === "note" ? "메모" : "일정"} · {draft.value.title || "제목 없음"} 이어쓰기</button><button className="icon-btn" aria-label={`${draft.value.title || "제목 없는 작성 내용"} 임시 저장 삭제`} onClick={() => removePlannerDraft(draft)}><Icon name="close" size={14} /></button></div>)}</section>}

      {view === "settings" && settings ? <div className="settings-stack">
        <LocalDataInfo />
        <section className="settings-section settings-appearance">
          <div className="settings-section-heading"><h2>화면 모드</h2><p>시스템 설정을 따르거나 화면 모드를 직접 선택하세요.</p></div>
          <div className="theme-control" role="group" aria-label="화면 모드">{([
            { value: "system", label: "시스템", icon: "monitor" }, { value: "light", label: "라이트", icon: "sun" }, { value: "dark", label: "다크", icon: "moon" }
          ] as const).map(mode => <button key={mode.value} className="theme-choice" aria-pressed={settings.theme === mode.value} disabled={busy} onClick={() => void action(() => updateSettings({ ...settings, theme: mode.value }))}><Icon name={mode.icon} size={16} />{mode.label}</button>)}</div>
        </section>

        <StoreReview />
        <section className="settings-section settings-support" aria-labelledby="settings-support-title">
          <div className="settings-section-heading"><h2 id="settings-support-title">도움말과 의견</h2><p>버그 제보와 기능 제안은 디스코드 커뮤니티에 남겨 주세요.</p></div>
          <CommunityLink />
        </section>

        <section className="settings-section">
          <div className="settings-section-heading"><h2>자동 수집</h2><p>지원 기록을 언제, 어느 사이트에서 가져올지 정해요.</p></div>
          <Toggle label="자동 기록" detail="사람인·잡코리아·원티드의 최종 제출을 관찰합니다. 확인되지 않은 결과는 지원 완료로 처리하지 않습니다." checked={settings.autoRecord} disabled={busy} onChange={() => void action(() => updateSettings({ ...settings, autoRecord: !settings.autoRecord }))} />
          <Toggle label="지원 현황 자동 가져오기" detail="기본은 꺼짐입니다. 켜면 직접 연 지원 현황의 현재 목록도 자동으로 가져옵니다." checked={settings.historyAutoCollect} disabled={busy} onChange={() => void action(() => updateSettings({ ...settings, historyAutoCollect: !settings.historyAutoCollect }))} />
          <div className="settings-platforms"><h3>사이트별 수집</h3><div className="settings-platform-grid">{platformIds.map(p => <div className="settings-platform-item" key={p}><PlatformSymbol platform={p} /><Toggle label={`${platformLabel[p]} 자동 수집`} detail={`${platformLabel[p]} 지원 기록 수집을 허용해요.`} checked={settings.consent[p]} disabled={busy} onChange={() => void action(() => updateSettings({ ...settings, consent: { ...settings.consent, [p]: !settings.consent[p] } }))} /></div>)}</div></div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading"><h2>경고와 기록 표시</h2></div>
          {([
            { key: "listingWarnings", label: "공고 목록 경고", detail: "공고 목록에 이전 지원 이력을 표시합니다." },
            { key: "detailWarnings", label: "공고 상세 경고", detail: "공고 상세에서 이전 지원 날짜와 직무를 표시합니다." },
            { key: "similarWarnings", label: "유사 기업명 경고", detail: "이름이 비슷한 기업을 추가로 표시합니다. 동일 기업으로 확정하지 않습니다." },
            { key: "showCancelled", label: "취소된 기록 표시", detail: "지원 기록 목록과 경고에 취소된 지원도 포함합니다." }
          ] as const).map(item => <Toggle key={item.key} label={item.label} detail={item.detail} checked={settings[item.key]} disabled={busy} onChange={() => void action(() => updateSettings({ ...settings, [item.key]: !settings[item.key] }))} />)}
        </section>

        <details className="settings-section advanced-settings">
          <summary>사이트 수집 진단</summary>
          <p><Sentences>지원 현황은 사이트별 목록 구조를 읽어 수집합니다. 화면 형태에 따라 인식하지 못할 수 있습니다. 그때는 팝업에서 개인정보를 제거한 화면 진단 파일을 저장해 주세요. 등록한 플랫폼별 선택자 JSON은 우선 적용합니다.</Sentences></p>
          <div className="profile-status">{platformIds.map(p => <span key={p}>{platformLabel[p]} · {settings.profiles[p] ? `${settings.profiles[p]!.version} 등록됨` : "기본 수집"}</span>)}</div>
          <div className="file-actions"><button className="btn" disabled={busy} onClick={() => profileInput.current?.click()}>선택자 파일 등록</button>{platformIds.filter(p => settings.profiles[p]).map(p => <button className="text-btn" key={p} disabled={busy} onClick={() => void action(async () => { const profiles = { ...settings.profiles }; delete profiles[p]; await updateSettings({ ...settings, profiles }) })}>{platformLabel[p]} 설정 해제</button>)}</div>
        </details>

        <details className="settings-section settings-help">
          <summary>지원 기록 가져오는 방법</summary>
          <ol className="help-steps"><li>사람인·잡코리아·원티드·리멤버에 직접 로그인합니다.</li><li>지원 현황에서 조회 기간을 선택합니다.</li><li>팝업의 ‘조회 기간 전체 가져오기’를 누릅니다.</li><li>다른 경로의 지원은 ‘직접 추가’로 기록합니다.</li></ol>
          <p className="small muted mt-3"><Sentences>전체 가져오기는 현재 조회 조건의 페이지를 순서대로 읽습니다. 화면에서 읽을 수 없는 기록과 다른 기간의 기록은 포함되지 않습니다. 기존 기록은 삭제하지 않습니다.</Sentences></p>
        </details>
        <section className="settings-section settings-backup">
          <div className="settings-section-heading"><h2>백업과 복원</h2><p>지원 기록·메모·일정을 파일로 보관해요. 복원하면 기존 데이터와 합쳐져요.</p></div>
          <div className="file-actions"><button className="btn" disabled={busy} onClick={() => void action(async () => { const backup = await rpc({ type: "backup" }); download("오늘시작-백업.json", JSON.stringify(backup, null, 2), "application/json") })}><Icon name="download" size={15} />JSON 백업</button><button className="btn" disabled={busy} onClick={() => backupInput.current?.click()}>JSON 복원</button></div>
        </section>
        <section className="settings-section reset-data-section">
          <div className="settings-section-heading"><h2>데이터 초기화</h2><p>저장한 지원 기록·메모·일정과 가져오기 상태를 지웁니다. 화면 모드와 수집 설정은 유지됩니다.</p></div>
          <button className="btn danger" disabled={busy || !snapshot} onClick={() => { setResetError(""); setResetting(true) }}>데이터 초기화</button>
        </section>
        <div className="settings-app-info"><span>오늘시작</span><span>버전 {chrome.runtime.getManifest().version}</span></div>
      </div> : view === "overview" ? <>
        <div className="dashboard-overview-top">
          <DashboardSummary records={dashboardRecords} source={activeDashboardSource} />
          <DashboardImports ready={!!snapshot} consent={settings?.consent} collectingPlatform={snapshot?.historyRun?.status === "running" ? snapshot.historyRun.platform : undefined} />
        </div>
        <UpcomingEvents events={planner.events} onOpen={event => openEvent(event)} onAll={() => navigate("calendar")} onNew={() => openEvent()} />
        <DashboardAnalytics records={snapshot?.records} source={activeDashboardSource} onSource={setDashboardSource} />
      </> : view === "calendar" ? <CareerCalendar planner={planner} records={records} onNew={date => openEvent(undefined, date)} onOpen={event => openEvent(event)} onRecord={setDetail} /> : view === "notes" ? <NotesPage key={snapshot?.dataGeneration || "initial"} generation={snapshot?.dataGeneration} planner={planner} records={records} onOpen={(note, menu) => openNote(note, undefined, undefined, menu)} onNew={() => openNote()} editingId={noteEditor?.activeId || noteEditor?.initial.id} renderEditor={noteEditor ? controls => (<NoteEditor key={noteEditor.initial.id} initial={noteEditor.initial} recovered={noteEditor.recovered} records={records} links={planner.links} generation={snapshot?.dataGeneration} {...controls} menuInitiallyOpen={noteEditor.initialMenu} onIdentityChange={initial => setNoteEditor(current => current && { ...current, initial, recovered: undefined, activeId: initial.id, initialMenu: false })} onNew={() => openNote()} onClose={(_reason, message) => { const id = noteEditor.initial.id; setNoteEditor(current => current?.initial.id === id ? undefined : current); if (message) setNotice(message) }} />) : undefined} /> : <>
        <div ref={reviewPanel}>{reviewOnly && <RecordReviewPanel records={reviewRecords} settings={settings} run={snapshot?.historyRun} onShowAll={() => setReviewOnly(false)} />}</div>
        <SubmissionActivity attempts={snapshot?.submissionAttempts} records={records} onEdit={record => editRecord(record, requiresStatusReview(record), true)} onAdd={() => setAdding(true)} />

        {!reviewOnly && <RecordImports ready={!!snapshot} records={records} consent={settings?.consent} reports={snapshot?.reports} completions={snapshot?.historyCompletions} run={snapshot?.historyRun} />}

        <div className="section-heading"><h2>지원 기록</h2><span className="small muted">{lastReport ? `최근 수집 ${formatTime(lastReport.at)}` : "수집 이력 없음"}</span></div>
        <section className="card">
          <div className="table-tabs">{(["all", ...applicationSources] as const).map(p => <button key={p} className={`table-tab ${platform === p ? "active" : ""}`} onClick={() => setPlatform(p)}>{p === "all" ? "전체" : platformLabel[p]}<span>{p === "all" ? records.length : counts[p]}</span></button>)}</div>
          <div className="table-tools"><label className="search-box"><Icon name="search" size={16} /><input placeholder="기업명 또는 직무 검색" aria-label="기업명 또는 직무 검색" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
          {sort.key === "appliedAt" && <p className="record-order-note">지원 날짜와 확인된 제출 시각 기준이에요. 시각이 없는 기록은 추가된 순서로, 지원일 미확인 기록은 아래에 표시해요.</p>}
          {snapshot ? <RecordTable records={filtered} total={records.length} sort={sort} onSort={sortByColumn} onEdit={record => editRecord(record)} onStatusEdit={record => editRecord(record, requiresStatusReview(record), true)} onDelete={record => { setDeleting(record); setDeleteLinked(false) }} onDetails={record => setDetail(planner.links.find(link => link.recordId === record.id)?.id)} noteCounts={noteCounts} onAdd={() => setAdding(true)} showImportActions={false} pageKey={JSON.stringify([query, platform, reviewOnly, sort, settings?.showCancelled])} /> : <div className="empty"><p>지원 기록을 불러오는 중…</p></div>}
        </section>
      </>}
    </main>
    <HistoryRunStatus run={snapshot?.historyRun} toast visible={view === "overview" || view === "records"} />
    {resetting && <ResetDataDialog count={records.length} noteCount={planner.notes.length} eventCount={planner.events.length} busy={busy} error={resetError} onClose={() => setResetting(false)} onReset={() => void resetData()} />}
    {detail && linkedRecord(detail, records, planner.links) && <RecordDetails key={detail} record={linkedRecord(detail, records, planner.links)!} linkId={detail} planner={planner} onClose={() => setDetail(undefined)} onNote={note => openNote(note, detail, detail)} onEvent={event => openEvent(event, undefined, detail, detail)} />}
    {eventEditor && <EventEditor key={eventEditor.initial.id} initial={eventEditor.initial} recovered={eventEditor.recovered} records={records} links={planner.links} generation={snapshot?.dataGeneration} onClose={(reason, message) => { const link = eventEditor.returnLinkId; setEventEditor(undefined); if (reason !== "outside" && link) setDetail(link); if (message) setNotice(message) }} />}

    <input hidden ref={backupInput} type="file" accept=".json,application/json" aria-label="JSON 백업 파일" onChange={e => { void importFile(e.target.files?.[0], "backup"); e.target.value = "" }} />
    <input hidden ref={profileInput} type="file" accept=".json,application/json" aria-label="선택자 JSON 파일" onChange={e => { void importFile(e.target.files?.[0], "profile"); e.target.value = "" }} />

    {adding && <ManualApplicationForm onClose={() => { setAdding(false); if (location.hash === "#add") navigate("records") }} onSaved={() => { setAdding(false); setNotice("지원 기록을 추가했습니다."); if (location.hash === "#add") navigate("records"); void load().catch(error => setError(error.message)) }} />}
    {editing && <div className="modal-backdrop" onKeyDown={e => { if (e.key === "Escape") setEditing(undefined) }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
      <div className="modal-heading"><h2 id="edit-title">지원 기록 수정</h2><button className="icon-btn" aria-label="닫기" onClick={() => setEditing(undefined)}><Icon name="close" size={18} /></button></div>
      {editingReview && <p className="modal-description">실제 지원 현황을 확인한 뒤 상태를 선택해 주세요.<br />알 수 없는 지원 날짜는 비워둘 수 있어요.</p>}
      <form onSubmit={e => { e.preventDefault(); void saveEditing() }}>
        <label>기업명<input autoFocus={!editingStatus} required maxLength={300} value={editing.companyName} onChange={e => setEditing({ ...editing, companyName: e.target.value })} /></label>
        <label>지원 직무<input required maxLength={1000} value={editing.jobTitle} onChange={e => setEditing({ ...editing, jobTitle: e.target.value })} /></label>
        <label>지원 날짜<input type="date" value={editing.appliedAt || ""} onChange={e => setEditing({ ...editing, appliedAt: e.target.value || undefined })} /></label>
        <label>상태<select ref={statusInput} aria-label="상태" value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as ApplicationStatus })}>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <div className="modal-actions"><button className="btn" type="button" disabled={busy} onClick={() => setEditing(undefined)}>취소</button>{editingReview && reviewRecords.some(record => record.id !== editing.id) && <button className="btn" type="button" disabled={busy || requiresStatusReview(editing)} onClick={() => void saveEditing(true)}>저장하고 다음 확인</button>}<button className="btn primary" disabled={busy || editingReview && requiresStatusReview(editing)} type="submit">변경 저장</button></div>
      </form>
    </section></div>}

    {deleting && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <h2 id="delete-title">지원 기록을 삭제할까요?</h2><p className="modal-description">{deleting.companyName} · {deleting.jobTitle}<br /><Sentences>채용 사이트의 지원은 취소되지 않습니다. 같은 내역을 가져오면 다시 저장될 수 있습니다.</Sentences></p>
      <label className="planner-checkbox"><input type="checkbox" checked={deleteLinked} onChange={event => setDeleteLinked(event.target.checked)} />연결된 메모와 일정도 함께 삭제</label><p className="small muted">선택하지 않으면 지원 연결만 해제하고 메모와 일정을 보관해요.</p>
      <div className="modal-actions"><button className="btn" onClick={() => setDeleting(undefined)}>돌아가기</button><button className="btn danger" disabled={busy} onClick={() => void action(async () => { await rpc({ type: "remove", id: deleting.id, linked: deleteLinked ? "delete" : "keep" }); setDeleting(undefined); setNotice("기록을 삭제했습니다.") })}>기록 삭제</button></div>
    </section></div>}
  </div>
}
export default Options
