import { RequestSchema, type Request } from "../messaging/protocol"
import type { Response } from "../messaging/contracts"
import { getSettings } from "../storage/settings"
import { authorizeSender, authorizeRequest } from "./authorization"
import type { RequestContext, RequestHandlers, RequestServices } from "./context"
import { applications } from "./applications"
import { snapshots } from "./snapshots"
import { history } from "./history"
import { planner } from "./planner"
import { management } from "./management"
import { submissions } from "./submissions"

const handlers = { ...applications, ...snapshots, ...history, ...planner, ...management, ...submissions } satisfies RequestHandlers

function dispatch<R extends Request>(request: R, context: RequestContext): Promise<Response<R>> {
  // TypeScript loses the discriminant correlation when indexing a handler map.
  // Each entry is checked against RequestHandlers before this single dispatch.
  const handler = handlers[request.type] as (request: R, context: RequestContext) => Promise<Response<R>>
  return handler(request, context)
}

export function createRequestHandler(services: RequestServices) {
  return async (raw: unknown, sender: chrome.runtime.MessageSender) => {
    const access = authorizeSender(sender)
    const request = RequestSchema.parse(raw)
    authorizeRequest(request, sender, access)
    return dispatch(request, { ...services, ...access, sender, settings: await getSettings() })
  }
}
