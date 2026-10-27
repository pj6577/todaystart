import type { SubmissionAttempt, SubmissionEvent, applicationPage } from "./model"
import type { DomPlatformAdapter } from "../platforms/adapter"
import type { SubmissionState, SubmissionStore } from "./store"

export interface SubmissionSource {
  tabId: number
  frameId: number
  rawUrl: string
  sender: chrome.runtime.MessageSender
  page: ReturnType<typeof applicationPage>
  adapter: DomPlatformAdapter
  publicListing: boolean
}
export interface SubmissionServices {
  store: SubmissionStore
  attachContexts(state: SubmissionState): Promise<void>
  materialize(attempt: SubmissionAttempt): Promise<void>
  observe(event: SubmissionEvent, sender: chrome.runtime.MessageSender): Promise<boolean>
}
export type SubmissionHandlers = {
  [K in SubmissionEvent["kind"]]: (event: Extract<SubmissionEvent, { kind: K }>, source: SubmissionSource, services: SubmissionServices) => Promise<boolean>
}
