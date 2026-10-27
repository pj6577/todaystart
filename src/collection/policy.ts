// Every read parses the visible document. A user-started run may navigate the
// site's own pagination controls in one tab, keeping its current filters.
export const collectionPolicy = {
  mode: "visible_document_only",
  backgroundTraversal: false,
  maxRecordsPerMessage: 2000,
  maxImportBytes: 20 * 1024 * 1024,
  pagination: "user_started_visible_tab_run",
  maxPagesPerRun: 100,
  historyReadyTimeoutMs: 45000,
  historyPollIntervalMs: 750,
  reviewBeforeAutomation: ["사이트 약관", "접근 정책", "robots 정책", "요청 빈도 제한", "별도 사용자 동의"]
} as const
