import type { ApplicationRecord, JobPosting } from "../core/model"
import type { Settings } from "../storage/settings"
import { PostingMatches } from "../core/posting-matches"
import { PostingView } from "./posting-view"
import { WarningInjector } from "../ui/warnings"

export class PostingWarnings {
  private readonly injector = new WarningInjector()
  private readonly matches = new PostingMatches()
  private readonly view = new PostingView()

  setTheme(theme: Settings["theme"]) { this.injector.setTheme(theme) }
  needsRepair() { return this.injector.needsRepair() }
  clear() { this.injector.clear(); this.view.clear() }
  render(postings: JobPosting[], records: ApplicationRecord[], settings: Settings, kind: "listing" | "detail", deferRender = false) {
    this.matches.update(records, settings.showCancelled)
    const found = new Map(postings.map(posting => [posting, this.matches.find(posting, settings.similarWarnings)]))
    const matches = postings.filter(posting => found.get(posting)!.length > 0).length
    const showWarnings = kind === "detail" ? settings.detailWarnings : settings.listingWarnings
    // Do not consume the view's change signature while deferred: the latest
    // records/settings must still render after the native application layer closes.
    if (!deferRender) {
      if (showWarnings) {
        const changed = this.view.changed(postings, records, JSON.stringify([kind, settings.theme, settings.showCancelled, settings.similarWarnings]))
        if (changed || this.injector.needsRepair()) this.injector.render(postings, posting => found.get(posting) || [], kind === "detail")
      } else this.clear()
    }
    const message = postings.length ? `${postings.length}개 공고를 확인했습니다.${matches ? ` ${matches}개 공고에 저장된 지원 이력이 있습니다.` : " 저장된 지원 이력과 일치하는 기업을 찾지 못했습니다. 미수집 이력은 확인할 수 없습니다."}` : "공고 영역을 인식하지 못했습니다. 로딩 완료 후 다시 확인하거나 사이트 화면 변경을 확인해 주세요."
    return { matches, message }
  }
}
