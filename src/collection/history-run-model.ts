import type { DiagnosticCode, Platform } from "../core/model"

export type HistoryRunIssue = "login_required" | "tab_closed" | "context_changed" | "consent_disabled" | "first_page_unavailable" | "navigation_failed" | "pagination_unknown" | "repeated_page" | "page_limit" | "partial" | "list_unreadable" | "connection_lost" | "unknown" | "user_stopped"

export interface HistoryRun {
  id: string
  platform: Platform
  tabId: number
  status: "running" | "completed" | "stopped" | "error"
  pages: number
  processed: number
  inserted: number
  updated: number
  skipped: number
  scope: string
  message: string
  issue?: HistoryRunIssue
  startedAt: string
  updatedAt: string
}
export interface HistoryRunPage {
  url: string
  filterUrl?: string
  fingerprint: string
  code: DiagnosticCode
  scope: string
  currentPage?: number
  hasNextPage: boolean
  hasFirstPage: boolean
  paginationFound: boolean
  endKnown: boolean
}
