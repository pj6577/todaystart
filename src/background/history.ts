import { getHistoryRun, startHistoryRun, stopHistoryRun } from "../collection/history-run"
import type { RequestHandlers } from "./context"

export const history = {
  async history_run(request, { sender, extensionPage }) {
    if (request.operation === "retry") {
      const run = await getHistoryRun()
      if (!run || run.status !== "error" || (!extensionPage && run.tabId !== sender.tab?.id) || (request.tabId !== undefined && request.tabId !== run.tabId)) throw new Error("이 탭에서 실패한 가져오기만 다시 시작할 수 있습니다.")
      return startHistoryRun(run.tabId)
    }
    if (!extensionPage && (request.operation !== "stop" || (await getHistoryRun())?.tabId !== sender.tab?.id)) throw new Error("이 탭에서 진행 중인 수집만 중지할 수 있습니다.")
    if (request.operation === "stop") return stopHistoryRun()
    if (!request.tabId) throw new Error("지원 현황 탭을 확인해 주세요.")
    return startHistoryRun(request.tabId)
  }
} satisfies Pick<RequestHandlers, "history_run">
