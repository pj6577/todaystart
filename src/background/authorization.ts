import type { Request } from "../messaging/protocol"
import { platformForUrl } from "../core/urls"

export function authorizeSender(sender: chrome.runtime.MessageSender) {
  if (sender.id !== chrome.runtime.id) throw new Error("허용되지 않은 요청입니다.")
  return {
    extensionPage: sender.url?.startsWith(chrome.runtime.getURL("")) === true,
    platform: sender.url ? platformForUrl(sender.url) : undefined
  }
}

export function authorizeRequest(request: Request, sender: chrome.runtime.MessageSender, access: ReturnType<typeof authorizeSender>) {
  // Submission observers have their own frame and live-tab validation.
  if (request.type === "submission" || request.type === "submission_policy") return
  if (!access.extensionPage && (!access.platform || sender.frameId !== 0)) throw new Error("지원 사이트의 최상위 화면에서만 접근할 수 있습니다.")
  if (!access.extensionPage && !["snapshot", "collect", "observe", "open_dashboard", "history_run"].includes(request.type)) throw new Error("기록 관리는 확장 프로그램 화면에서만 가능합니다.")
}
