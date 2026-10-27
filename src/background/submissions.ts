import { applicationPage } from "../submission/model"
import type { RequestHandlers } from "./context"

export const submissions = {
  async submission_policy(request, { settings, extensionPage, platform }) {
    if (extensionPage || !platform) throw new Error("지원 사이트에서만 확인할 수 있습니다.")
    return { enabled: settings.autoRecord && settings.consent[platform] }
  },
  async submission(request, { submissions, settings, sender, extensionPage, platform }) {
    if (extensionPage || !platform || request.event.platform !== platform) throw new Error("지원 사이트에서만 관찰할 수 있습니다.")
    if (!settings.autoRecord || !settings.consent[platform]) return false
    if (request.event.platform === "wanted" && ["context", "entered", "apply_clicked", "wanted_submit", "wanted_completed"].includes(request.event.kind)) {
      if (sender.frameId !== 0 || !sender.tab?.id) return false
      // A SPA's content-script sender can retain the document's original URL.
      // Verify the browser's current tab URL instead of trusting a page string.
      const tab = await chrome.tabs.get(sender.tab.id)
      const page = tab.url && applicationPage(tab.url)
      const event = request.event
      const jobId = event.kind === "context" || event.kind === "wanted_submit" ? event.context.sourceJobId : "sourceJobId" in event ? event.sourceJobId : undefined
      if (!page || page.platform !== "wanted" || page.jobId !== jobId) return false
      // The click can already have navigated by the time the worker dequeues
      // it. Validate the live tab's same job, then persist the observed click
      // with its canonical posting URL. Completion still requires /applied.
      return submissions.observe(event, { ...sender, url: event.kind === "wanted_completed" ? tab.url : `https://www.wanted.co.kr/wd/${jobId}` })
    }
    return submissions.observe(request.event, sender)
  }
} satisfies Pick<RequestHandlers, "submission_policy" | "submission">
