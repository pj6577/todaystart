import type { CollectionResult, PageState, Platform, SyncReport } from "../core/model"
import type { Snapshot } from "../messaging/contracts"
import { PageRequestSchema, dispatchPageRequest, type PageHandlers } from "../messaging/page-protocol"
import type { DomPlatformAdapter } from "../platforms/adapter"
import { historyDiagnostics } from "../platforms/history-diagnostics"
import { isBuiltInHistoryUrl } from "../platforms/history"
import { historyContextUrl, historyNavigationUrl, historyPagination } from "../platforms/history-pagination"
import type { HistoryRunPage } from "./history-run-model"

interface PageContext {
  platform: Platform
  adapter(): DomPlatformAdapter
  snapshot(): Snapshot | undefined
  state(): PageState
  pageKind(): PageState["kind"]
  sync(automatic: boolean, result?: CollectionResult, runId?: string): Promise<SyncReport>
  refreshSnapshot(): Promise<void>
  refresh(): Promise<void>
  collectHistory(): Promise<CollectionResult>
}

export function createPageCommandHandler(context: PageContext) {
  const { platform } = context
  async function navigate(request: { type: "NEXT_PAGE" | "FIRST_PAGE" }) {
    const settings = context.snapshot()!.settings
    if (!settings.consent[platform] || context.pageKind() !== "history") throw new Error("지원 현황에서 자동 수집 설정을 켠 뒤 이용해 주세요.")
    const selector = request.type === "NEXT_PAGE" && context.adapter().profile?.nextPage
    const pagination = historyPagination(document, platform)
    const next = selector ? document.querySelector<HTMLElement>(selector) : request.type === "FIRST_PAGE" ? pagination.first : pagination.next
    if (!next || next.matches(':disabled,[disabled],[aria-disabled="true"]')) throw new Error("이동할 페이지를 찾을 수 없습니다.")
    const navigationUrl = !selector && historyNavigationUrl(platform, location.href, pagination, request.type)
    if (navigationUrl) { location.assign(navigationUrl); return true }
    next.click()
    return true
  }
  const handlers = {
    async GET_PAGE() { await context.refresh(); return context.state() },
    async HISTORY_DIAGNOSTICS() { return historyDiagnostics(document, platform) },
    async HISTORY_RUN_INSPECT() {
      if (!isBuiltInHistoryUrl(location.href, platform)) throw new Error("지원 현황에서 실행해 주세요.")
      const result = await context.collectHistory(), pagination = historyPagination(document, platform)
      const signature = JSON.stringify(result.records.map(record => [record.id, record.status]).sort(([a], [b]) => a!.localeCompare(b!)))
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signature))
      const fingerprint = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("")
      return {
        url: location.href, filterUrl: historyContextUrl(document, platform), fingerprint, code: result.code, scope: result.scope,
        currentPage: pagination.currentPage, hasNextPage: pagination.hasNextPage,
        hasFirstPage: pagination.hasFirstPage, paginationFound: pagination.paginationFound, endKnown: pagination.endKnown
      } satisfies HistoryRunPage
    },
    async SYNC_PAGE(request) {
      if (context.pageKind() !== "history") throw new Error("로그인한 지원 현황 페이지에서 실행해 주세요.")
      if (request.runId && (context.snapshot()?.historyRun?.id !== request.runId || context.snapshot()?.historyRun?.status !== "running")) throw new Error("중지된 가져오기 요청입니다.")
      const report = await context.sync(false, undefined, request.runId)
      await context.refreshSnapshot()
      await context.refresh()
      return report
    },
    NEXT_PAGE: navigate,
    FIRST_PAGE: navigate
  } satisfies PageHandlers
  return async (raw: unknown) => {
    const request = PageRequestSchema.parse(raw)
    await context.refreshSnapshot()
    return dispatchPageRequest(handlers, request)
  }
}
