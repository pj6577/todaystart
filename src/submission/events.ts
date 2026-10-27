import { applicationPage, type SubmissionEvent } from "./model"
import { platformForUrl } from "../core/urls"
import { DomPlatformAdapter } from "../platforms/adapter"
import { publicPostingProfileFor } from "../platforms/public-postings"
import type { SubmissionSource, SubmissionServices, SubmissionHandlers } from "./event-context"
import { wantedEvents } from "./wanted-events"
import { saraminEvents } from "./saramin-events"
import { jobkoreaEvents } from "./jobkorea-events"
import { contextEvents } from "./context-events"
import { attemptEvents } from "./attempt-events"

const handlers = { ...wantedEvents, ...saraminEvents, ...jobkoreaEvents, ...contextEvents, ...attemptEvents } satisfies SubmissionHandlers

export function submissionSource(event: SubmissionEvent, sender: chrome.runtime.MessageSender): SubmissionSource {
  const tabId = sender.tab?.id, frameId = sender.frameId, rawUrl = sender.url
  if (!tabId || frameId === undefined || !rawUrl || platformForUrl(rawUrl) !== event.platform) throw new Error("지원 흐름의 출처를 확인해 주세요.")
  const adapter = new DomPlatformAdapter(event.platform)
  return { tabId, frameId, rawUrl, sender, adapter, page: applicationPage(rawUrl), publicListing: event.platform === "jobkorea" && adapter.isJobListingPage(rawUrl) && !!publicPostingProfileFor("jobkorea", rawUrl) }
}

export function dispatchSubmission<E extends SubmissionEvent>(event: E, source: SubmissionSource, services: SubmissionServices): Promise<boolean> {
  const handler = handlers[event.kind] as (event: E, source: SubmissionSource, services: SubmissionServices) => Promise<boolean>
  return handler(event, source, services)
}
