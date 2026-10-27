import { getDataGeneration } from "../storage/data-generation"
import { syncCollection } from "../collection/sync"
import { applicationIdentity } from "../core/identity"
import { isBuiltInHistoryUrl } from "../platforms/history"
import { getHistoryRun } from "../collection/history-run"
import { saveReport } from "../storage/settings"
import type { RequestHandlers } from "./context"

export const applications = {
  async manual_create(request, { repository }) {
    const record = await repository.createManual(request.application)
    await chrome.storage.local.set({ revision: crypto.randomUUID() })
    return record
  },
  async collect(request, { repository, submissions, settings, sender, extensionPage, platform }) {
    if (extensionPage || platform !== request.platform) throw new Error("현재 사이트와 수집 플랫폼이 다릅니다.")
    const dataGeneration = await getDataGeneration()
    if (request.dataGeneration !== dataGeneration) throw new Error("지원 기록이 초기화되었습니다. 다시 가져오기를 시작해 주세요.")
    if (request.runId) {
      const run = await getHistoryRun()
      if (run?.id !== request.runId || run.status !== "running" || run.tabId !== sender.tab?.id) throw new Error("중지된 가져오기 요청입니다.")
    }
    if (!settings.consent[platform] || (request.automatic && !settings.autoRecord)) throw new Error("자동 수집이 꺼져 있습니다. 설정에서 켜 주세요.")
    if (!settings.profiles[platform] && !isBuiltInHistoryUrl(sender.url!, platform)) throw new Error("지원 현황 페이지에서 실행해 주세요.")
    if (request.result.records.some(r => r.platform !== platform || r.evidence !== "history_page")) throw new Error("수집 기록의 출처가 올바르지 않습니다.")
    request.result.records = request.result.records.map(r => ({ ...r, id: applicationIdentity(r) }))
    const report = await syncCollection(repository, platform, request.result)
    await submissions.reconcile()
    await saveReport(report)
    if (report.collected) await chrome.storage.local.set({ revision: crypto.randomUUID() })
    return report
  },
  async observe(request, { repository, submissions, settings, extensionPage, platform }) {
    const record = request.record
    if (extensionPage || record.platform !== platform || !settings.consent[platform] || !settings.autoRecord || !settings.profiles[platform]) throw new Error("자동 기록 권한을 확인해 주세요.")
    if (!((record.evidence === "success_page" && record.status === "applied") || (record.evidence === "submission_attempt" && record.status === "pending_confirmation"))) throw new Error("신규 지원의 근거를 확인해 주세요.")
    record.id = applicationIdentity(record)
    if (record.status === "pending_confirmation" && !record.sourceJobId && !record.jobUrl) throw new Error("확인 대기 기록을 식별할 공고 정보가 없습니다.")
    const result = await repository.merge([record])
    await submissions.reconcile()
    await chrome.storage.local.set({ revision: crypto.randomUUID() })
    return result
  },
  async edit(request, { repository, submissions }) {
    const record = await repository.edit(request.id, request.changes)
    await submissions.reconcile()
    await chrome.storage.local.set({ revision: crypto.randomUUID() })
    return record
  },
  async remove(request, { repository }) {
    await repository.delete(request.id, request.linked)
    await chrome.storage.local.set({ revision: crypto.randomUUID() })
    return true
  }
} satisfies Pick<RequestHandlers, "manual_create" | "collect" | "observe" | "edit" | "remove">
