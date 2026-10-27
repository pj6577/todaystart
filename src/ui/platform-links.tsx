import React, { useState } from "react"
import type { Platform } from "../core/model"
import { platformLabel } from "../core/model"
import { Icon } from "./components"
import { PlatformLogo, PlatformSymbol } from "./platform-logo"
import { rpc } from "../messaging/protocol"
import { platformDefinitions, platformIds } from "../core/platforms"

export const historyUrls = Object.fromEntries(platformIds.map(id => [id, platformDefinitions[id].historyUrl])) as Record<Platform, string>
export function useHistoryImport({ platform, enabled = true, busy = false, allowModifiedNavigation = false }: { platform: Platform; enabled?: boolean; busy?: boolean; allowModifiedNavigation?: boolean }) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState("")
  async function start(event: React.MouseEvent<HTMLElement>) {
    if (allowModifiedNavigation && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return
    event.preventDefault()
    if (starting || busy) return
    if (!enabled) { void openManagement("settings"); return }
    setStarting(true); setError("")
    try {
      const tab = await chrome.tabs.create({ url: historyUrls[platform] })
      if (!tab.id) throw new Error("지원 현황 탭을 열지 못했습니다.")
      await rpc({ type: "history_run", operation: "start", tabId: tab.id })
    } catch (e) { setError(e instanceof Error ? e.message : "수집을 시작하지 못했습니다.") }
    finally { setStarting(false) }
  }
  return { starting, error, start }
}

export function HistoryTask({ platform, count = 0, enabled = true, completed = false, compact = false, busy = false, collecting = false }: { platform: Platform; count?: number; enabled?: boolean; completed?: boolean; compact?: boolean; busy?: boolean; collecting?: boolean }) {
  const { starting, error, start } = useHistoryImport({ platform, enabled, busy, allowModifiedNavigation: !compact })
  if (compact) return <div className="history-import">
    <div className="history-import-row"><span className="source-label"><PlatformSymbol platform={platform} />{platformLabel[platform]}</span>
      <button type="button" className="btn history-import-button" disabled={starting || busy} aria-label={`${platformLabel[platform]} ${enabled ? "지원 기록 가져오기" : "수집 설정 열기"}`} aria-busy={starting || collecting} onClick={event => void start(event)}>
        {starting || collecting ? "가져오는 중…" : enabled ? "기록 가져오기" : "수집 설정"}{!starting && !collecting && <Icon name={enabled ? "download" : "settings"} size={13} />}
      </button>
    </div>
    {error && <p className="history-import-error" role="alert">{error}</p>}
  </div>
  return <a className="history-task" href={historyUrls[platform]} target="_blank" rel="noreferrer" aria-label={`${platformLabel[platform]} 지원 기록 가져오기`} aria-description={completed ? "최근 전체 수집 완료" : "지원 현황에서 전체 수집 시작"} aria-busy={starting} onClick={event => void start(event)}>
    <span className={`task-checkbox ${completed ? "completed" : ""}`} aria-hidden="true">{completed && <Icon name="check" size={12} />}</span>
    <PlatformLogo platform={platform} />
    <span className="task-content"><strong>{platformLabel[platform]} 지원 기록 가져오기</strong><span>{error || (starting ? "지원 현황을 열고 수집을 시작합니다…" : !enabled ? "먼저 수집 설정을 켜 주세요" : count || completed ? `${count}건 저장됨 · 눌러서 업데이트` : "눌러서 지원 현황 열고 수집 시작")}</span></span>
    <Icon name="arrow" size={17} />
  </a>
}
export function HistoryLink({ platform, compact = false }: { platform: Platform; compact?: boolean }) {
  return <a className={compact ? "site-link" : "btn"} href={historyUrls[platform]} target="_blank" rel="noreferrer">
    {platformLabel[platform]}{compact ? " 지원 현황" : "에서 가져오기"}<Icon name="external" size={14} />
  </a>
}
export function openManagement(view: "overview" | "records" | "settings" | "add" = "overview") {
  return chrome.tabs.create({ url: chrome.runtime.getURL("options.html") + "#" + view })
}
