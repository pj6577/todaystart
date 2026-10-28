import React from "react"
import { Icon, Toggle, Sentences } from "./components"
import { platformLabel } from "../core/model"
import { platformIds } from "../core/platforms"
import type { Settings } from "../storage/settings"
import { rpc } from "../messaging/protocol"
import { download } from "./client"
import { PlatformSymbol } from "./platform-logo"
import { LocalDataInfo } from "./local-data-info"
import { StoreReview } from "./store-review"
import { CommunityLink } from "./community-link"

interface SettingsPageProps {
  settings: Settings
  busy: boolean
  ready: boolean
  action(operation: () => Promise<void>): Promise<void>
  onSettingsChange(settings: Settings): Promise<void>
  onProfileImport(): void
  onBackupImport(): void
  onReset(): void
}

export function SettingsPage({ settings, busy, ready, action, onSettingsChange, onProfileImport, onBackupImport, onReset }: SettingsPageProps) {
  return <div className="settings-stack">
        <LocalDataInfo />
        <section className="settings-section settings-appearance">
          <div className="settings-section-heading"><h2>화면 모드</h2><p>시스템 설정을 따르거나 화면 모드를 직접 선택하세요.</p></div>
          <div className="theme-control" role="group" aria-label="화면 모드">{([
            { value: "system", label: "시스템", icon: "monitor" }, { value: "light", label: "라이트", icon: "sun" }, { value: "dark", label: "다크", icon: "moon" }
          ] as const).map(mode => <button key={mode.value} className="theme-choice" aria-pressed={settings.theme === mode.value} disabled={busy} onClick={() => void action(() => onSettingsChange({ ...settings, theme: mode.value }))}><Icon name={mode.icon} size={16} />{mode.label}</button>)}</div>
        </section>

        <StoreReview />
        <section className="settings-section settings-support" aria-labelledby="settings-support-title">
          <div className="settings-section-heading"><h2 id="settings-support-title">도움말과 의견</h2><p>버그 제보와 기능 제안은 디스코드 커뮤니티에 남겨 주세요.</p></div>
          <CommunityLink />
        </section>
        <section className="settings-section settings-contribution" aria-labelledby="settings-contribution-title">
          <div className="settings-section-heading"><h2 id="settings-contribution-title">개발자라면</h2><p>GitHub에서 코드를 살펴보고 개선에 함께해 주세요.</p></div>
          <a className="btn settings-contribution-link" href="https://github.com/pj6577/todaystart" target="_blank" rel="noopener noreferrer" aria-label="오픈소스에 기여하기 (GitHub, 새 탭)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" /></svg>
            <span>오픈소스에 기여하기</span><Icon name="external" size={11} />
          </a>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading"><h2>자동 수집</h2><p>지원 기록을 언제, 어느 사이트에서 가져올지 정해요.</p></div>
          <Toggle label="자동 기록" detail="사람인·잡코리아·원티드의 최종 제출을 관찰합니다. 확인되지 않은 결과는 지원 완료로 처리하지 않습니다." checked={settings.autoRecord} disabled={busy} onChange={() => void action(() => onSettingsChange({ ...settings, autoRecord: !settings.autoRecord }))} />
          <Toggle label="지원 현황 자동 가져오기" detail="기본은 꺼짐입니다. 켜면 직접 연 지원 현황의 현재 목록도 자동으로 가져옵니다." checked={settings.historyAutoCollect} disabled={busy} onChange={() => void action(() => onSettingsChange({ ...settings, historyAutoCollect: !settings.historyAutoCollect }))} />
          <div className="settings-platforms"><h3>사이트별 수집</h3><div className="settings-platform-grid">{platformIds.map(p => <div className="settings-platform-item" key={p}><PlatformSymbol platform={p} /><Toggle label={`${platformLabel[p]} 자동 수집`} detail={`${platformLabel[p]} 지원 기록 수집을 허용해요.`} checked={settings.consent[p]} disabled={busy} onChange={() => void action(() => onSettingsChange({ ...settings, consent: { ...settings.consent, [p]: !settings.consent[p] } }))} /></div>)}</div></div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading"><h2>경고와 기록 표시</h2></div>
          {([
            { key: "listingWarnings", label: "공고 목록 경고", detail: "공고 목록에 이전 지원 이력을 표시합니다." },
            { key: "detailWarnings", label: "공고 상세 경고", detail: "공고 상세에서 이전 지원 날짜와 직무를 표시합니다." },
            { key: "similarWarnings", label: "유사 기업명 경고", detail: "이름이 비슷한 기업을 추가로 표시합니다. 동일 기업으로 확정하지 않습니다." },
            { key: "showCancelled", label: "취소된 기록 표시", detail: "지원 기록 목록과 경고에 취소된 지원도 포함합니다." }
          ] as const).map(item => <Toggle key={item.key} label={item.label} detail={item.detail} checked={settings[item.key]} disabled={busy} onChange={() => void action(() => onSettingsChange({ ...settings, [item.key]: !settings[item.key] }))} />)}
        </section>

        <details className="settings-section advanced-settings">
          <summary>사이트 수집 진단</summary>
          <p><Sentences>지원 현황은 사이트별 목록 구조를 읽어 수집합니다. 화면 형태에 따라 인식하지 못할 수 있습니다. 그때는 팝업에서 개인정보를 제거한 화면 진단 파일을 저장해 주세요. 등록한 플랫폼별 선택자 JSON은 우선 적용합니다.</Sentences></p>
          <div className="profile-status">{platformIds.map(p => <span key={p}>{platformLabel[p]} · {settings.profiles[p] ? `${settings.profiles[p]!.version} 등록됨` : "기본 수집"}</span>)}</div>
          <div className="file-actions"><button className="btn" disabled={busy} onClick={() => onProfileImport()}>선택자 파일 등록</button>{platformIds.filter(p => settings.profiles[p]).map(p => <button className="text-btn" key={p} disabled={busy} onClick={() => void action(async () => { const profiles = { ...settings.profiles }; delete profiles[p]; await onSettingsChange({ ...settings, profiles }) })}>{platformLabel[p]} 설정 해제</button>)}</div>
        </details>

        <details className="settings-section settings-help">
          <summary>지원 기록 가져오는 방법</summary>
          <ol className="help-steps"><li>사람인·잡코리아·원티드·리멤버에 직접 로그인합니다.</li><li>지원 현황에서 조회 기간을 선택합니다.</li><li>팝업의 ‘조회 기간 전체 가져오기’를 누릅니다.</li><li>다른 경로의 지원은 ‘직접 추가’로 기록합니다.</li></ol>
          <p className="small muted mt-3"><Sentences>전체 가져오기는 현재 조회 조건의 페이지를 순서대로 읽습니다. 화면에서 읽을 수 없는 기록과 다른 기간의 기록은 포함되지 않습니다. 기존 기록은 삭제하지 않습니다.</Sentences></p>
        </details>
        <section className="settings-section settings-backup">
          <div className="settings-section-heading"><h2>백업과 복원</h2><p>지원 기록·메모·일정을 파일로 보관해요. 복원하면 기존 데이터와 합쳐져요.</p></div>
          <div className="file-actions"><button className="btn" disabled={busy} onClick={() => void action(async () => { const backup = await rpc({ type: "backup" }); download("오늘시작-백업.json", JSON.stringify(backup, null, 2), "application/json") })}><Icon name="download" size={15} />JSON 백업</button><button className="btn" disabled={busy} onClick={() => onBackupImport()}>JSON 복원</button></div>
        </section>
        <section className="settings-section reset-data-section">
          <div className="settings-section-heading"><h2>데이터 초기화</h2><p>저장한 지원 기록·메모·일정과 가져오기 상태를 지웁니다. 화면 모드와 수집 설정은 유지됩니다.</p></div>
          <button className="btn danger" disabled={busy || !ready} onClick={onReset}>데이터 초기화</button>
        </section>
        <div className="settings-app-info"><span>오늘시작</span><span>버전 {chrome.runtime.getManifest().version}</span></div>
      </div>
}
