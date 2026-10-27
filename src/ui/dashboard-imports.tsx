import React from "react"
import type { Platform } from "../core/model"
import { platformIds } from "../core/platforms"
import { HistoryTask } from "./platform-links"

export function DashboardImports({ ready, consent, collectingPlatform }: { ready: boolean; consent?: Partial<Record<Platform, boolean>>; collectingPlatform?: Platform }) {
  return <section className="analytics-panel dashboard-imports" aria-labelledby="dashboard-imports-title">
    <div className="analytics-heading"><h2 id="dashboard-imports-title">지원 기록 업데이트</h2></div>
    <ul className="source-imports" aria-label="사이트별 기록 가져오기">{platformIds.map(platform => <li key={platform}>
      <HistoryTask platform={platform} compact enabled={consent?.[platform] !== false} busy={!ready || !!collectingPlatform} collecting={collectingPlatform === platform} />
    </li>)}</ul>
  </section>
}
