import React, { useEffect, useMemo, useRef, useState } from "react"
import { Brand, Icon, Notice } from "./ui/components"
import { download, formatTime, toCsv } from "./ui/client"
import { RecordEditDialog, RecordDeleteDialog } from "./ui/record-dialogs"
import { SettingsPage } from "./ui/settings-page"
import { RecordTable } from "./ui/record-table"
import { useTheme } from "./ui/theme"
import { HistoryRunStatus } from "./ui/history-run-status"
import { rpc } from "./messaging/protocol"
import { platformLabel, applicationSources, requiresStatusReview, type ApplicationRecord, type ApplicationSource } from "./core/model"
import { compareApplicationRecords, compareRecordsByColumn, type RecordSort, type RecordSortKey } from "./core/record-order"
import { RecordReviewPanel } from "./ui/record-review-panel"
import { ManualApplicationForm } from "./ui/manual-application-form"
import { manualApplicationPrefill, type ManualApplicationPrefill } from "./ui/manual-application-prefill"
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
import { linkedRecord } from "./ui/planner-components"
import { noteCountsByRecord } from "./core/planner-lookups"
import { removePlannerDraft } from "./ui/planner-drafts"
import { usePlannerEditors } from "./ui/use-planner-editors"
import { useWorkspaceData } from "./ui/use-workspace-data"
import { eventToDraft } from "./core/planner"
import type { CareerEventChange } from "./ui/career-board"
import type { CareerEvent } from "./core/planner"
import { EventKindsProvider } from "./ui/event-kinds-context"
import { EventKindsEditor } from "./ui/event-kinds-editor"
import "./style.css"
import "./ui/planner.css"
import "./ui/career-board.css"
import "./ui/note-board.css"

type View = "overview" | "records" | "calendar" | "notes" | "settings"
function viewFromHash(): View {
  const view = location.hash.slice(1)
  return view === "add" ? "records" : view === "records" || view === "calendar" || view === "notes" || view === "settings" ? view : "overview"
}

function Options() {
  const [view, setView] = useState<View>(viewFromHash)
  const [query, setQuery] = useState("")
  const [platform, setPlatform] = useState<ApplicationSource | "all">("all")
  const [dashboardSource, setDashboardSource] = useState<ApplicationPath | "all">("all")
  const [adding, setAdding] = useState(location.hash === "#add")
  const [manualInitial, setManualInitial] = useState<ManualApplicationPrefill>()
  const [sort, setSort] = useState<RecordSort>({ key: "appliedAt", direction: "descending" })
  const [reviewOnly, setReviewOnly] = useState(false)
  const [editingReview, setEditingReview] = useState(false)
  const [editingStatus, setEditingStatus] = useState(false)
  const reviewPanel = useRef<HTMLDivElement>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [editing, setEditing] = useState<ApplicationRecord>()
  const [deleting, setDeleting] = useState<ApplicationRecord>()
  const [deleteLinked, setDeleteLinked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [managingKinds, setManagingKinds] = useState(false)
  const [resetError, setResetError] = useState("")
  const backupInput = useRef<HTMLInputElement>(null)
  const profileInput = useRef<HTMLInputElement>(null)

  const { snapshot, setSnapshot, drafts, load } = useWorkspaceData(
    () => { resetEditors(); setManagingKinds(false) },
    setError
  )
  const { detail, setDetail, noteEditor, setNoteEditor, eventEditor, setEventEditor, openNote, openEvent, resumeDraft, resetEditors } = usePlannerEditors(snapshot, () => navigate("notes"))
  useTheme(snapshot?.settings.theme)
  useEffect(() => {
    const navigate = () => { setView(viewFromHash()); if (viewFromHash() !== "notes") setNoteEditor(undefined); if (location.hash === "#add") { setManualInitial(undefined); setAdding(true) } }
    window.addEventListener("hashchange", navigate)
    return () => window.removeEventListener("hashchange", navigate)
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
  async function changeCalendarEvent(event: CareerEvent, changes: CareerEventChange) {
    const generation = snapshot?.dataGeneration
    try {
      const saved = await rpc({ type: "event_save", event: { ...eventToDraft(event), ...changes }, dataGeneration: generation })
      setSnapshot(current => current?.dataGeneration === generation && current?.planner ? { ...current, planner: { ...current.planner, events: current.planner.events.map(item => item.id === saved.id && item.revision <= saved.revision ? saved : item) } } : current)
    } catch (error) {
      await load().catch(() => {})
      throw error
    }
  }
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
  function confirmSubmission(record: ApplicationRecord) {
    const appliedAt = record.appliedAt || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
    editRecord({ ...record, appliedAt }, requiresStatusReview(record), true)
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
        const result = await rpc({ type: "restore", backup: value })
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

  return <EventKindsProvider config={planner.eventKindConfig}><div className="app-shell">
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

      {view === "settings" && settings ? <SettingsPage settings={settings} busy={busy} ready={!!snapshot} action={action} onSettingsChange={updateSettings} onProfileImport={() => profileInput.current?.click()} onBackupImport={() => backupInput.current?.click()} onReset={() => { setResetError(""); setResetting(true) }} /> : view === "overview" ? <>
        <div className="dashboard-overview-top">
          <DashboardSummary records={dashboardRecords} source={activeDashboardSource} />
          <DashboardImports ready={!!snapshot} consent={settings?.consent} collectingPlatform={snapshot?.historyRun?.status === "running" ? snapshot.historyRun.platform : undefined} />
        </div>
        <UpcomingEvents events={planner.events} onOpen={event => openEvent(event)} onAll={() => navigate("calendar")} onNew={() => openEvent()} />
        <DashboardAnalytics records={snapshot?.records} source={activeDashboardSource} onSource={setDashboardSource} />
      </> : view === "calendar" ? <CareerCalendar key={snapshot?.dataGeneration || "initial"} planner={planner} records={records} onNew={(date, kind) => openEvent(undefined, date, undefined, undefined, kind)} onOpen={event => openEvent(event)} onRecord={setDetail} onChange={changeCalendarEvent} onManageKinds={() => setManagingKinds(true)} /> : view === "notes" ? <NotesPage key={snapshot?.dataGeneration || "initial"} generation={snapshot?.dataGeneration} planner={planner} records={records} onOpen={(note, menu) => openNote(note, undefined, undefined, menu)} onNew={() => openNote()} editingId={noteEditor?.activeId || noteEditor?.initial.id} renderEditor={noteEditor ? controls => (<NoteEditor key={noteEditor.initial.id} initial={noteEditor.initial} recovered={noteEditor.recovered} records={records} links={planner.links} generation={snapshot?.dataGeneration} {...controls} menuInitiallyOpen={noteEditor.initialMenu} onIdentityChange={initial => setNoteEditor(current => current && { ...current, initial, recovered: undefined, activeId: initial.id, initialMenu: false })} onNew={() => openNote()} onClose={(_reason, message) => { const id = noteEditor.initial.id; setNoteEditor(current => current?.initial.id === id ? undefined : current); if (message) setNotice(message) }} />) : undefined} /> : <>
        <div ref={reviewPanel}>{reviewOnly && <RecordReviewPanel records={reviewRecords} settings={settings} run={snapshot?.historyRun} onShowAll={() => setReviewOnly(false)} />}</div>
        <SubmissionActivity attempts={snapshot?.submissionAttempts} records={records} onEdit={confirmSubmission} onAdd={attempt => { setManualInitial(manualApplicationPrefill(attempt)); setAdding(true) }} />

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

    {adding && <ManualApplicationForm key={manualInitial?.submissionAttemptId || "manual"} initial={manualInitial} generation={snapshot?.dataGeneration} onClose={() => { setAdding(false); setManualInitial(undefined); if (location.hash === "#add") navigate("records") }} onSaved={() => { setAdding(false); setManualInitial(undefined); setNotice("지원 기록을 추가했습니다."); if (location.hash === "#add") navigate("records"); void load().catch(error => setError(error.message)) }} />}
    {editing && <RecordEditDialog record={editing} review={editingReview} focusStatus={editingStatus} hasNext={reviewRecords.some(record => record.id !== editing.id)} busy={busy} onChange={setEditing} onClose={() => setEditing(undefined)} onSave={saveEditing} />}
    {deleting && <RecordDeleteDialog record={deleting} linked={deleteLinked} busy={busy} onLinkedChange={setDeleteLinked} onClose={() => setDeleting(undefined)} onDelete={() => void action(async () => { await rpc({ type: "remove", id: deleting.id, linked: deleteLinked ? "delete" : "keep" }); setDeleting(undefined); setNotice("기록을 삭제했습니다.") })} />}

    {managingKinds && <EventKindsEditor config={planner.eventKindConfig} events={planner.events} generation={snapshot?.dataGeneration} onClose={() => setManagingKinds(false)} onSaved={load} />}
  </div></EventKindsProvider>
}
export default Options
