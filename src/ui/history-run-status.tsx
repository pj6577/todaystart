import React, { useCallback, useEffect, useState } from "react"
import type { HistoryRun } from "../collection/history-run-model"
import { rpc } from "../messaging/protocol"
import { platformLabel } from "../core/model"
import { Icon } from "./components"
import { historyRunNotice } from "./history-run-notice"
import { historyUrls, openManagement } from "./platform-links"

export function HistoryRunStatus({ run, toast = false, visible = true }: { run?: HistoryRun; toast?: boolean; visible?: boolean }) {
  const [error, setError] = useState("")
  const [dismissed, setDismissed] = useState<string>()
  const [loaded, setLoaded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pageVisible, setPageVisible] = useState(document.visibilityState === "visible")
  const key = run ? `${run.id}:${run.status}` : undefined
  const collecting = run?.status === "running"
  useEffect(() => setError(""), [key])
  useEffect(() => { setHovered(false); setFocused(false) }, [key, visible])
  useEffect(() => {
    let mounted = true
    void chrome.storage.local.get("dismissedHistoryRun").then(value => {
      if (mounted) { setDismissed(typeof value.dismissedHistoryRun === "string" ? value.dismissedHistoryRun : undefined); setLoaded(true) }
    }).catch(() => { if (mounted) setLoaded(true) })
    const changed = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.dismissedHistoryRun) setDismissed(typeof changes.dismissedHistoryRun.newValue === "string" ? changes.dismissedHistoryRun.newValue : undefined)
    }
    const visibility = () => setPageVisible(document.visibilityState === "visible")
    chrome.storage.onChanged.addListener(changed)
    document.addEventListener("visibilitychange", visibility)
    return () => { mounted = false; chrome.storage.onChanged.removeListener(changed); document.removeEventListener("visibilitychange", visibility) }
  }, [])
  const dismiss = useCallback(async () => {
    if (!key) return
    setDismissed(key)
    try { await chrome.storage.local.set({ dismissedHistoryRun: key }) } catch { /* Dismissal still works for this session. */ }
  }, [key])
  useEffect(() => {
    if (!toast || !visible || !pageVisible || !loaded || !key || collecting || dismissed === key || hovered || focused || error) return
    const timer = window.setTimeout(() => void dismiss(), run?.status === "completed" ? 6000 : 12000)
    return () => window.clearTimeout(timer)
  }, [toast, visible, pageVisible, loaded, key, collecting, dismissed, hovered, focused, error, dismiss, run?.status])
  if (!run || !visible || (!collecting && (!loaded || dismissed === key))) return null
  const notice = historyRunNotice(run)
  async function openSite() {
    try {
      const tab = await chrome.tabs.get(run!.tabId).catch(() => undefined)
      if (tab?.id) {
        await chrome.tabs.update(tab.id, { active: true })
        if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true })
      } else await chrome.tabs.create({ url: historyUrls[run!.platform] })
    } catch { setError("사이트를 열지 못했어요. 브라우저에서 지원 현황을 직접 열어 주세요.") }
  }
  return <section className={`${toast ? "history-run-toast" : "collection-progress"} collection-notice is-${notice.tone}`} role="status" aria-label="지원 기록 가져오기 알림" aria-live="polite" aria-atomic="true"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false) }}>
    <span className="collection-notice-icon" aria-hidden="true">{collecting ? <span className="collection-spinner" /> : notice.tone === "success" ? <Icon name="check" size={18} /> : notice.tone === "warning" ? <span>!</span> : <Icon name="download" size={18} />}</span>
    <div className="collection-notice-copy"><h2>{notice.title}</h2><p>{error || notice.message}</p><small>{notice.detail}</small>
      {collecting ? <button className="text-btn collection-notice-action" onClick={() => void rpc({ type: "history_run", operation: "stop" }).catch(() => setError("중지하지 못했어요. 잠시 후 다시 눌러 주세요."))}>중지</button>
        : notice.action && <button className="text-btn collection-notice-action" onClick={() => void (notice.action === "settings" ? openManagement("settings").catch(() => setError("설정을 열지 못했어요. 왼쪽 메뉴에서 설정을 열어 주세요.")) : openSite())}>{notice.action === "settings" ? "설정 열기" : `${platformLabel[run.platform]} 열기`}<Icon name="external" size={12} /></button>}
    </div>
    {!collecting && <button className="icon-btn collection-dismiss" aria-label="수집 안내 닫기" onClick={() => void dismiss()}><Icon name="close" size={16} /></button>}
  </section>
}
