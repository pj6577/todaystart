import { afterEach, beforeEach, expect, it } from "vitest"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"
import type { ApplicationRecord } from "../../src/core/model"
import { record } from "../helpers"

let repository: ApplicationRepository
const attemptId = "0ca9c22a-e99c-4b68-a639-04bc842797a1"
const posting = { platform: "wanted" as const, companyName: "가상 원티드 기업", jobTitle: "프론트엔드 개발자" }
const at = "2026-11-04T04:00:00.000Z"
function submission(changes: Partial<ApplicationRecord> = {}) {
  return record({ ...posting, sourceJobId: "325032", jobUrl: "https://www.wanted.co.kr/wd/325032", appliedAt: "2026-11-04", appliedAtTime: at,
    submissionAttemptId: attemptId, submissionStage: "confirmed", evidence: "success_page", collectedAt: at, lastSeenAt: at, lastSyncedAt: at, ...changes })
}
function history(changes: Partial<ApplicationRecord> = {}) {
  return record({ ...posting, sourceJobId: undefined, appliedAt: undefined, sourceCreatedAt: "2026-11-04", sourceStatus: "접수", readStatus: "unknown",
    collectedAt: "2026-11-04T05:00:00.000Z", lastSeenAt: "2026-11-04T05:00:00.000Z", lastSyncedAt: "2026-11-04T05:00:00.000Z", ...changes })
}
beforeEach(() => { repository = new ApplicationRepository(new TodayStartDatabase("wanted-reconciliation-" + crypto.randomUUID())) })
afterEach(async () => { await repository.db.delete() })

it("완료 자동 기록 뒤 DOM 내역을 가져오면 기존 지원일·제출 시각을 유지하며 한 건에 갱신한다", async () => {
  const observed = submission(), imported = history()
  await repository.merge([observed])
  expect(await repository.merge([imported])).toEqual({ inserted: 0, updated: 1 })
  const saved = await repository.list()
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ id: observed.id, sourceJobId: "325032", appliedAt: "2026-11-04", appliedAtTime: at, sourceCreatedAt: "2026-11-04", sourceStatus: "접수", submissionAttemptId: attemptId, status: "applied", readStatus: "unknown" })
  expect(await repository.merge([imported])).toEqual({ inserted: 0, updated: 1 })
  expect(await repository.list()).toHaveLength(1)
})
it("DOM → API 보강 → DOM → 늦은 완료·메타데이터 관찰에도 한 지원과 ID 연결을 유지한다", async () => {
  const observed = submission(), imported = history()
  await repository.merge([observed]); await repository.merge([imported])
  const enriched = history({ sourceApplicationId: "800010", sourceJobId: "325032", readStatus: "read", sourceCreatedAt: "2026-11-04T10:00:00" })
  expect(await repository.merge([enriched])).toEqual({ inserted: 0, updated: 1 })
  await repository.merge([imported])
  await repository.merge([{ ...observed, lastSeenAt: "2026-11-04T06:00:00.000Z" }])
  const saved = await repository.list(), planner = await repository.plannerSnapshot()
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ id: enriched.id, sourceApplicationId: "800010", readStatus: "read", sourceCreatedAt: "2026-11-04T10:00:00", appliedAtTime: at, submissionAttemptId: attemptId })
  expect(planner.links).toHaveLength(1)
  expect(planner.links[0]!.aliases).toEqual(expect.arrayContaining([observed.id, imported.id, enriched.id]))
})
it("내역을 먼저 수집한 뒤 완료 이벤트가 늦게 와도 한 건으로 연결한다", async () => {
  await repository.merge([history()])
  expect(await repository.merge([submission()])).toEqual({ inserted: 0, updated: 1 })
  expect(await repository.list()).toHaveLength(1)
})
it("지원 시도의 완료를 직접 확인할 때도 기존 내역에 연결한 실제 저장 항목을 반환한다", async () => {
  const imported = history({ sourceApplicationId: "800010", sourceJobId: "325032" })
  await repository.merge([imported])
  const saved = await repository.createManual({ ...posting, appliedAt: "2026-11-04", status: "applied", jobUrl: "https://www.wanted.co.kr/wd/325032" }, { submissionAttemptId: attemptId, submissionStage: "confirmed", sourceJobId: "325032" })
  expect(saved).toMatchObject({ id: imported.id, sourceApplicationId: "800010", appliedAt: "2026-11-04", submissionAttemptId: attemptId })
  expect(await repository.list()).toHaveLength(1)
})
it("이미 저장된 중복을 재수집으로 정리하고 양쪽 메모·일정 연결을 보존한다", async () => {
  const observed = submission(), imported = history({ status: "unknown" })
  // Simulate records saved by an older release, bypassing reconciliation.
  for (const value of [observed, imported]) {
    await repository.db.applications.put(value)
    const linkId = crypto.randomUUID()
    await repository.db.applicationLinks.put({ id: linkId, recordId: value.id, aliases: [value.id] })
    await repository.saveNote({ id: crypto.randomUUID(), expectedRevision: 0, title: value.id, body: "보존할 메모", pinned: false, checklist: [], linkId })
    await repository.saveEvent({ id: crypto.randomUUID(), expectedRevision: 0, title: "면접 준비", kind: "interview", date: "2026-11-10", time: "14:00", status: "planned", location: "온라인", body: "보존할 일정", checklist: [], linkId })
  }
  expect(await repository.merge([history()])).toEqual({ inserted: 0, updated: 1 })
  const saved = await repository.list(), planner = await repository.plannerSnapshot()
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ status: "applied", appliedAtTime: at, sourceStatus: "접수" })
  expect(planner.links).toHaveLength(1)
  expect(planner.notes).toHaveLength(2)
  expect(planner.notes.every(note => note.linkId === planner.links[0]!.id && note.body === "보존할 메모")).toBe(true)
  expect(planner.events).toHaveLength(2)
  expect(planner.events.every(event => event.linkId === planner.links[0]!.id && event.body === "보존할 일정")).toBe(true)
  const backup = await repository.backup()
  await repository.clear(); await repository.restore(backup); await repository.restore(backup)
  expect(await repository.list()).toHaveLength(1)
  expect((await repository.plannerSnapshot()).notes).toHaveLength(2)
  expect((await repository.plannerSnapshot()).events).toHaveLength(2)
})
it("이전 날짜에 작성한 지원서는 API 공고 ID가 일치할 때 실제 제출일을 보존해 연결한다", async () => {
  await repository.merge([submission()])
  await repository.merge([history({ sourceCreatedAt: "2026-11-01", sourceApplicationId: "800010", sourceJobId: "325032" })])
  expect(await repository.list()).toMatchObject([{ appliedAt: "2026-11-04", appliedAtTime: at, sourceCreatedAt: "2026-11-01", sourceApplicationId: "800010" }])
})
it.each([
  { platform: "saramin" },
  { jobTitle: "백엔드 개발자" },
  { companyName: "다른 기업" },
  { sourceJobId: "999999" },
  { sourceCreatedAt: "2026-11-05" },
  { sourceCreatedAt: "2026-11-01" }
] satisfies Partial<ApplicationRecord>[])("다른 지원이거나 날짜 근거가 부족하면 합치지 않는다: %j", async changes => {
  await repository.merge([submission()]); await repository.merge([history(changes)])
  expect(await repository.list()).toHaveLength(2)
})
it("같은 기업·직무의 완료 후보가 두 개이면 임의로 선택하지 않는다", async () => {
  await repository.merge([submission(), submission({ sourceJobId: "325033", jobUrl: "https://www.wanted.co.kr/wd/325033", submissionAttemptId: crypto.randomUUID() })])
  await repository.merge([history()])
  expect(await repository.list()).toHaveLength(3)
})
it("한 번에 가져오는 서로 다른 지원 ID가 두 개이면 같은 자동 기록에 합치지 않는다", async () => {
  await repository.merge([submission()])
  await repository.merge([history({ sourceApplicationId: "800010", sourceJobId: "325032" }), history({ sourceApplicationId: "800011", sourceJobId: "325032" })])
  expect(await repository.list()).toHaveLength(3)
})
it("작성일이 같은 API 내역의 공고 ID가 서로 다르면 연결을 추정하지 않는다", async () => {
  await repository.merge([submission()])
  await repository.merge([history({ sourceApplicationId: "800010", sourceJobId: "325032" }), history({ sourceApplicationId: "800011", sourceJobId: "325033" })])
  expect(await repository.list()).toHaveLength(3)
})
it("기업 ID와 지원 ID 충돌을 이름·날짜가 같다는 이유로 무시하지 않는다", async () => {
  await repository.merge([submission({ companyIdentifier: "101", sourceApplicationId: "800001" })])
  await repository.merge([history({ companyIdentifier: "102", sourceApplicationId: "800002", sourceJobId: "325032" })])
  expect(await repository.list()).toHaveLength(2)
})
it("DOM과 API 보강이 한 묶음에 있어도 신규 건수로 세지 않는다", async () => {
  await repository.merge([submission()])
  expect(await repository.merge([history(), history({ sourceApplicationId: "800010", sourceJobId: "325032" })])).toEqual({ inserted: 0, updated: 2 })
  expect(await repository.list()).toHaveLength(1)
})
it("같은 회사·직무여도 URL의 공고 ID가 충돌하면 합치지 않는다", async () => {
  await repository.merge([submission()])
  await repository.merge([history({ sourceJobId: "325032", jobUrl: "https://www.wanted.co.kr/wd/999999" })])
  expect(await repository.list()).toHaveLength(2)
})
it("모호한 당일 지원들이 있으면 이전 날짜의 공고 ID 일치 기록도 자동 선택하지 않는다", async () => {
  await repository.merge([submission()])
  await repository.merge([
    history({ sourceApplicationId: "800010", sourceJobId: "325032" }),
    history({ sourceApplicationId: "800011", sourceJobId: "325032" }),
    history({ sourceApplicationId: "800012", sourceJobId: "325032", sourceCreatedAt: "2026-11-01" })
  ])
  expect(await repository.list()).toHaveLength(4)
})
