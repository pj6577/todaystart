import { afterEach, beforeEach, describe, it, expect } from "vitest"
import { ApplicationRepository, TodayStartDatabase } from "../../src/storage/repository"
import { applicationIdentity, mergedRecord } from "../../src/core/identity"
import { syncCollection } from "../../src/collection/sync"
import { record } from "../helpers"

let repository: ApplicationRepository
beforeEach(() => { repository = new ApplicationRepository(new TodayStartDatabase("test-" + crypto.randomUUID())) })
afterEach(async () => { await repository.db.delete() })

describe("직접 추가", () => {
  const draft = { platform: "manual", sourceLabel: "기업 홈페이지", companyName: "원티드랩", jobTitle: "프론트엔드 개발자", appliedAt: "2026-10-19", status: "applied", jobUrl: "https://careers.example.com/jobs/123?token=secret#apply" }
  it("외부 HTTPS 주소와 경로를 저장하고 반복 추가는 중복을 만들지 않는다", async () => {
    await repository.createManual(draft)
    await repository.createManual(draft)
    expect(await repository.list()).toHaveLength(1)
    expect((await repository.list())[0]).toMatchObject({ platform: "manual", sourceLabel: "기업 홈페이지", evidence: "manual", jobUrl: "https://careers.example.com/jobs/123" })
  })
  it("수정한 수동 기록의 백업을 빈 저장소에 반복 복원해도 중복되지 않는다", async () => {
    const created = (await repository.createManual(draft))!
    await repository.edit(created.id, { companyName: "수정 기업", jobTitle: "수정 직무", appliedAt: "2026-10-18", status: "cancelled" })
    const backup = await repository.backup()
    await repository.db.applications.clear()
    await repository.restore(backup)
    await repository.restore(backup)
    expect(await repository.list()).toHaveLength(1)
    expect((await repository.list())[0]).toMatchObject({ companyName: "수정 기업", status: "cancelled" })
  })
  it("지원 경로나 날짜가 다른 기록은 보존한다", async () => {
    await repository.createManual(draft)
    await repository.createManual({ ...draft, sourceLabel: "이메일" })
    await repository.createManual({ ...draft, appliedAt: "2026-10-18" })
    expect(await repository.list()).toHaveLength(3)
  })
  it("직접 입력한 확인 대기도 날짜와 지원 경로를 구분한다", async () => {
    await repository.createManual({ ...draft, status: "pending_confirmation" })
    await repository.createManual({ ...draft, status: "pending_confirmation", appliedAt: "2026-10-18" })
    await repository.createManual({ ...draft, status: "pending_confirmation", sourceLabel: "이메일" })
    expect(await repository.list()).toHaveLength(3)
  })
  it("사이트 기록을 직접 추가한 뒤 자동 수집해도 한 건으로 병합한다", async () => {
    const saved = (await repository.createManual({ ...draft, platform: "wanted", jobUrl: "https://www.wanted.co.kr/wd/22942" }))!
    await repository.merge([{ ...saved, sourceApplicationId: "wanted-application-1", sourceLabel: undefined, evidence: "history_page", id: applicationIdentity({ ...saved, sourceApplicationId: "wanted-application-1" }) }])
    expect(await repository.list()).toHaveLength(1)
    expect((await repository.list())[0]?.sourceLabel).toBeUndefined()
  })
  it.each([
    { companyName: " " }, { appliedAt: "2026-02-30" }, { jobUrl: "javascript:alert(1)" },
    { jobUrl: "http://careers.example.com" }, { jobUrl: "https://user:password@example.com" },
    { platform: "wanted", jobUrl: "https://careers.example.com/jobs/123" }
  ])("잘못된 입력은 저장하지 않는다: %o", async change => {
    await expect(repository.createManual({ ...draft, ...change })).rejects.toThrow()
    expect(await repository.list()).toHaveLength(0)
  })
})
it("preserves observed submission time across history refresh and removes stale status text when resolved", async () => {
  const original = record({ appliedAtTime: "2026-10-10T01:23:45Z", status: "unknown", sourceStatus: "인식하지 못한 상태" })
  await repository.merge([original])
  await repository.edit(original.id, { companyName: original.companyName, jobTitle: original.jobTitle, appliedAt: original.appliedAt, status: "applied" })
  expect((await repository.list())[0]).toMatchObject({ status: "applied", appliedAtTime: original.appliedAtTime })
  expect((await repository.list())[0]?.sourceStatus).toBeUndefined()
  await repository.merge([{ ...original, appliedAtTime: undefined, sourceStatus: undefined, lastSeenAt: "2026-10-22T00:00:00Z" }])
  expect((await repository.list())[0]).toMatchObject({ status: "applied", appliedAtTime: original.appliedAtTime })
})
describe("중복 제거와 병합", () => {
  it("같은 지원을 반복 수집해도 한 건만 저장", async () => {
    expect(await repository.merge([record(), record()])).toEqual({ inserted: 1, updated: 1 })
    expect(await repository.list()).toHaveLength(1)
  })
  it("지원 ID를 우선하고 직무가 다르면 보존", async () => {
    await repository.merge([record({ sourceApplicationId: "1" }), record({ sourceApplicationId: "2", jobTitle: "디자이너" })])
    expect(await repository.list()).toHaveLength(2)
  })
  it("같은 공고라도 다른 날짜의 지원은 별개", async () => {
    await repository.merge([record(), record({ appliedAt: "2026-10-12" })])
    expect(await repository.list()).toHaveLength(2)
  })
  it("ID 조합 경계가 모호해도 충돌하지 않는다", () => expect(applicationIdentity(record({ jobTitle: "개발자|2026" }))).not.toBe(applicationIdentity(record({ jobTitle: "개발자" }))))
  it("누락이나 수집 실패는 삭제·취소로 처리하지 않는다", async () => {
    await repository.merge([record()])
    await syncCollection(repository, "saramin", { records: [], code: "error", message: "다음 페이지 실패", hasNextPage: true, scope: "부분 기간", skipped: 0 })
    expect(await repository.list()).toEqual([record()])
  })
  it("최근 확인된 취소를 보존하고 과거 완료로 되돌리지 않는다", () => {
    const cancelled = record({ status: "cancelled", lastSeenAt: "2026-10-12T12:00:00.000Z" })
    expect(mergedRecord(cancelled, record()).status).toBe("cancelled")
    expect(mergedRecord(record(), cancelled).status).toBe("cancelled")
    expect(mergedRecord(cancelled, record({ status: "unknown", lastSeenAt: "2026-10-13T12:00:00.000Z" })).status).toBe("cancelled")
  })
  it("대기 기록을 지원 이력으로 확인하면 같은 건으로 갱신", async () => {
    await repository.merge([record({ id: "pending-1", appliedAt: undefined, status: "pending_confirmation", evidence: "success_page" })])
    await repository.merge([record({ sourceApplicationId: "confirmed-1" })])
    expect(await repository.list()).toHaveLength(1)
    expect((await repository.list())[0]?.status).toBe("applied")
  })
  it("나중에 지원 ID가 생기면 복합 키를 승격한다", async () => {
    await repository.merge([record()])
    const stable = record({ sourceApplicationId: "stable" })
    await repository.merge([stable])
    await repository.merge([stable])
    expect(await repository.list()).toHaveLength(1)
  })
  it("잡코리아의 마감일이 붙은 기존 8건을 지원 ID와 깨끗한 제목으로 갱신한다", async () => {
    const current = Array.from({ length: 20 }, (_, index) => record({ platform: "jobkorea", sourceApplicationId: String(80000000 + index), sourceJobId: String(90000000 + index), jobUrl: `https://www.jobkorea.co.kr/Recruit/GI_Read/${90000000 + index}`, jobTitle: `개발자 ${index}` }))
    const legacy = current.slice(0, 8).map(value => { const changed = { ...value, sourceApplicationId: undefined, jobTitle: value.jobTitle + " (~10/30)" }; return { ...changed, id: applicationIdentity(changed) } })
    await repository.merge(legacy)
    expect(await repository.merge(current)).toEqual({ inserted: 12, updated: 8 })
    expect(await repository.list()).toHaveLength(20)
    expect((await repository.list()).every(value => !!value.sourceApplicationId && !value.jobTitle.includes("(~"))).toBe(true)
  })
  it("같은 공고에 여러 지원 ID가 있으면 마감일 변형 병합으로 추정하지 않는다", async () => {
    const legacy = record({ platform: "jobkorea", jobTitle: "개발자 (~10/30)" })
    await repository.merge([legacy])
    await repository.merge([record({ platform: "jobkorea", jobTitle: "개발자", sourceApplicationId: "a" }), record({ platform: "jobkorea", jobTitle: "개발자", sourceApplicationId: "b" })])
    expect(await repository.list()).toHaveLength(3)
  })
  it("승격 후 지원 ID를 다시 제공하지 않는 화면에서도 중복 생성하지 않는다", async () => {
    await repository.merge([record(), record({ sourceApplicationId: "stable" }), record()])
    expect(await repository.list()).toHaveLength(1)
    expect((await repository.list())[0]?.sourceApplicationId).toBe("stable")
  })
  it("사용자 수정 기록의 백업을 반복 복원해도 중복되지 않는다", async () => {
    const original = record()
    await repository.merge([original])
    await repository.edit(original.id, { companyName: original.companyName, jobTitle: "수정한 직무", appliedAt: original.appliedAt, status: "applied" })
    await repository.restore(await repository.backup())
    expect(await repository.list()).toHaveLength(1)
  })
  it("확인 대기 백업을 빈 DB에 반복 복원해도 중복되지 않는다", async () => {
    const pending = record({ appliedAt: undefined, status: "pending_confirmation", evidence: "submission_attempt" })
    const backup = { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [pending] }
    await repository.restore(backup)
    await repository.restore(backup)
    expect(await repository.list()).toHaveLength(1)
  })
  it("재시작 후에도 IndexedDB에 남는다", async () => {
    await repository.merge([record()])
    const name = repository.db.name
    repository.db.close()
    repository = new ApplicationRepository(new TodayStartDatabase(name))
    expect(await repository.list()).toHaveLength(1)
  })
  it("복원은 검증 후 전체를 병합하며 반복해도 중복되지 않는다", async () => {
    await repository.merge([record()])
    const backup = await repository.backup()
    await repository.restore(backup)
    expect(await repository.list()).toHaveLength(1)
    await expect(repository.restore({ ...backup, records: [record(), { bad: true }] })).rejects.toThrow()
    expect(await repository.list()).toHaveLength(1)
  })
  it("필드 검증 실패 시 부분 저장하지 않는다", async () => {
    await expect(repository.merge([record(), { bad: true }])).rejects.toThrow()
    expect(await repository.list()).toHaveLength(0)
  })
})
