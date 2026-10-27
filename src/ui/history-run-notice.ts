import type { HistoryRun, HistoryRunIssue } from "../collection/history-run-model"
import { platformLabel } from "../core/model"

// Runs already in session storage before the update have no structured issue.
function legacyIssue(run: HistoryRun): HistoryRunIssue {
  if (/로그인이 필요해 수집/.test(run.message)) return "login_required"
  if (/조회 조건|탭 주소/.test(run.message)) return "context_changed"
  if (/첫 페이지|현재 페이지 번호/.test(run.message)) return "first_page_unavailable"
  if (/다음 페이지|마지막 페이지/.test(run.message)) return "pagination_unknown"
  if (run.skipped) return "partial"
  if (run.status === "stopped") return "user_stopped"
  return "unknown"
}

export function historyRunNotice(run: HistoryRun) {
  const site = platformLabel[run.platform]
  const detail = run.pages > 0
    ? `${run.pages}페이지까지 확인 · ${run.inserted}건 추가 · ${run.updated}건 갱신${run.skipped ? ` · ${run.skipped}건 확인 필요` : ""}`
    : "기존에 저장한 기록은 그대로예요."
  const notice = (title: string, message: string, tone: "info" | "success" | "warning", action?: "site" | "settings") => ({ title: `${site} · ${title}`, message, detail, tone, action })
  if (run.status === "running") return notice("지원 기록 가져오는 중", "지원 현황 탭을 열어 두세요. 끝나면 알려 드릴게요.", "info")
  if (run.status === "completed") return notice("가져오기 완료", run.processed ? "조회한 기간의 지원 기록을 모두 확인했어요." : "조회한 기간에 지원 기록이 없어요.", "success")
  // The cause comes from the collector's observed state, not a guess from UI text.
  switch (run.issue ?? legacyIssue(run)) {
    case "login_required": return notice("로그인이 필요해요", "로그인 안내 화면을 확인했어요. 사이트에 로그인한 뒤 다시 가져와 주세요.", "warning", "site")
    case "tab_closed": return notice("지원 현황 탭이 닫혔어요", "사이트의 지원 현황을 다시 연 뒤 가져와 주세요.", "warning", "site")
    case "context_changed": return notice("조회 화면이 바뀌었어요", "지원 현황 주소나 조회 조건이 달라졌어요. 원하는 조회 기간을 선택한 뒤 다시 가져와 주세요.", "warning", "site")
    case "consent_disabled": return notice("가져오기 설정이 꺼져 있어요", "설정에서 이 사이트의 수집을 켠 뒤 다시 가져와 주세요.", "warning", "settings")
    case "first_page_unavailable": return notice("첫 페이지를 확인하지 못했어요", "사이트의 지원 현황을 1페이지로 이동한 뒤 다시 가져와 주세요.", "warning", "site")
    case "navigation_failed": return notice("페이지 이동을 완료하지 못했어요", "페이지가 바뀐 것을 확인하지 못했어요. 사이트에서 페이지 이동을 확인한 뒤 다시 가져와 주세요.", "warning", "site")
    case "pagination_unknown": return notice("마지막 페이지인지 확인이 필요해요", "다음 페이지 버튼을 찾지 못했어요. 사이트에 남은 기록이 있는지 확인해 주세요.", "warning", "site")
    case "repeated_page": return notice("같은 목록이 반복됐어요", "이미 가져온 목록이 다시 나타났어요. 사이트에서 페이지 이동을 확인한 뒤 다시 가져와 주세요.", "warning", "site")
    case "page_limit": return notice("가져오기 한도에 도달했어요", "한 번에 100페이지까지 가져올 수 있어요. 조회 기간을 나누어 다시 가져와 주세요.", "warning", "site")
    case "partial": return notice("일부 기록을 읽지 못했어요", `${run.skipped}건을 읽지 못했어요. 다시 가져와도 같다면 누락된 기록을 직접 추가해 주세요.`, "warning", "site")
    case "list_unreadable": return notice("지원 목록을 읽지 못했어요", "아직 원인을 확인하지 못했어요. 사이트의 목록이 모두 표시된 뒤 다시 가져와 주세요.", "warning", "site")
    case "connection_lost": return notice("지원 현황과 연결하지 못했어요", "사이트를 새로고침한 뒤 다시 가져와 주세요. 계속 안 되면 설정의 ‘의견 보내기’로 알려 주세요.", "warning", "site")
    case "user_stopped": return notice("가져오기를 멈췄어요", "여기까지 가져온 기록은 저장했어요. 필요할 때 다시 가져올 수 있어요.", "info")
    default: return notice("가져오기를 마치지 못했어요", "원인을 확인하지 못했어요. 다시 가져와도 같다면 설정의 ‘의견 보내기’로 알려 주세요.", "warning", "site")
  }
}
