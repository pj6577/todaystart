import type { ApplicationRepository } from "../storage/repository"
import type { SubmissionTracker } from "../submission/tracker"
import type { Settings } from "../storage/settings"
import type { Platform } from "../core/model"
import type { Request } from "../messaging/protocol"
import type { ResponseMap } from "../messaging/contracts"

export interface RequestServices {
  repository: ApplicationRepository
  submissions: SubmissionTracker
}

export interface RequestContext extends RequestServices {
  sender: chrome.runtime.MessageSender
  extensionPage: boolean
  platform?: Platform
  settings: Settings
}

export type RequestHandlers = {
  [K in Request["type"]]: (request: Extract<Request, { type: K }>, context: RequestContext) => Promise<ResponseMap[K]>
}
