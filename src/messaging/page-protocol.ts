import { z } from "zod"
import type { PageState, SyncReport } from "../core/model"
import type { HistoryRunPage } from "../collection/history-run-model"
import type { historyDiagnostics } from "../platforms/history-diagnostics"
import type { Envelope } from "./protocol"

export const PageRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_PAGE") }).strict(),
  z.object({ type: z.literal("SYNC_PAGE"), runId: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("NEXT_PAGE") }).strict(),
  z.object({ type: z.literal("FIRST_PAGE") }).strict(),
  z.object({ type: z.literal("HISTORY_DIAGNOSTICS") }).strict(),
  z.object({ type: z.literal("HISTORY_RUN_INSPECT") }).strict()
])
export type PageRequest = z.infer<typeof PageRequestSchema>
export interface PageResponseMap {
  GET_PAGE: PageState
  SYNC_PAGE: SyncReport
  NEXT_PAGE: boolean
  FIRST_PAGE: boolean
  HISTORY_DIAGNOSTICS: ReturnType<typeof historyDiagnostics>
  HISTORY_RUN_INSPECT: HistoryRunPage
}
export type PageResponse<R extends PageRequest> = PageResponseMap[R["type"]]
export type PageHandlers = { [K in PageRequest["type"]]: (request: Extract<PageRequest, { type: K }>) => Promise<PageResponseMap[K]> }

export class PageRequestError extends Error {
  constructor(message: string, readonly kind: "connection_lost" | "no_response" | "remote") { super(message) }
}

export async function sendPageRequest<R extends PageRequest>(tabId: number, request: R): Promise<PageResponse<R>> {
  const response: Envelope<PageResponse<R>> | undefined = await chrome.tabs.sendMessage(tabId, request).catch(error => {
    throw new PageRequestError(String(error), "connection_lost")
  })
  if (!response) throw new PageRequestError("지원 현황에 연결하지 못했습니다.", "no_response")
  if (!response.ok) throw new PageRequestError(response.error, "remote")
  return response.data
}

export function dispatchPageRequest<R extends PageRequest>(handlers: PageHandlers, request: R): Promise<PageResponse<R>> {
  const handler = handlers[request.type] as (request: R) => Promise<PageResponse<R>>
  return handler(request)
}
