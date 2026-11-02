import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultSearchPreferences, jobSearchPreferencesKey, readSearchPreferences, saveSearchPreferences, type SearchPreferences } from "../../src/search/preferences"

const stored = new Map<string, string>()
const storage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value) },
  key: (index: number) => [...stored.keys()][index] ?? null,
  get length() { return stored.size }
}
beforeEach(() => { stored.clear(); vi.stubGlobal("localStorage", storage) })
afterEach(() => vi.unstubAllGlobals())
const selected = (): SearchPreferences => ({ ...defaultSearchPreferences(), query: "React", filters: { group: [], role: ["frontend", "backend"], region: ["seoul"], career: ["new", "experienced"], careerMin: 0, careerMax: 3 }, sites: ["saramin", "jobkorea"], excludeApplied: true })

describe("통합검색의 마지막 적용 조건 1건 저장", () => {
  it("신입 하한 0·복수 선택·검색어·사이트·제외 설정을 복원한다", () => {
    expect(saveSearchPreferences(selected())).toBe(true)
    expect(readSearchPreferences()).toEqual(selected())
  })
  it("새 적용은 같은 키 1건을 교체하고 결과·페이지·지원 기록을 저장하지 않는다", () => {
    saveSearchPreferences(selected())
    const next = { ...defaultSearchPreferences(), query: "다른 검색" }
    saveSearchPreferences(next)
    expect(localStorage.length).toBe(1)
    expect(localStorage.key(0)).toBe(jobSearchPreferencesKey)
    expect(JSON.parse(localStorage.getItem(jobSearchPreferencesKey)!)).toEqual({ version: 1, ...next })
    expect(readSearchPreferences()).toEqual(next)
    expect(saveSearchPreferences({ ...next, jobs: [{ jobTitle: "저장하면 안 되는 공고" }] } as SearchPreferences)).toBe(false)
    expect(readSearchPreferences()).toEqual(next)
  })
  it("전체 초기화와 사이트만 선택한 빈 검색도 다음 열기에 유지한다", () => {
    saveSearchPreferences(selected())
    const cleared = { ...defaultSearchPreferences(), sites: ["jobkorea"] as const }
    expect(saveSearchPreferences({ ...cleared, sites: [...cleared.sites] })).toBe(true)
    expect(readSearchPreferences()).toEqual(cleared)
  })
  it.each([
    "not json", "null", "[]", JSON.stringify({ ...selected(), version: 2 }),
    JSON.stringify({ ...selected(), version: 1, filters: { ...selected().filters, role: ["invalid"] } }),
    JSON.stringify({ ...selected(), version: 1, filters: { ...selected().filters, careerMin: 5, careerMax: 2 } }),
    JSON.stringify({ ...selected(), version: 1, filters: { ...selected().filters, region: null } }),
    JSON.stringify({ ...selected(), version: 1, sites: [] }),
    JSON.stringify({ ...selected(), version: 1, sites: ["evil"] }),
    JSON.stringify({ ...selected(), version: 1, query: "a".repeat(101) }),
    JSON.stringify({ ...selected(), version: 1, excludeApplied: "true" }),
    JSON.stringify({ ...selected(), version: 1, results: ["unexpected"] })
  ])("깨진 값과 다른 버전은 기본값으로 복구하며 읽기 중 덮어쓰지 않는다: %s", raw => {
    const storage = { getItem: vi.fn(() => raw) }
    expect(readSearchPreferences(storage)).toEqual(defaultSearchPreferences())
    expect(storage.getItem).toHaveBeenCalledWith(jobSearchPreferencesKey)
  })
  it("저장소 읽기·쓰기 실패가 검색 화면으로 전파되지 않는다", () => {
    expect(readSearchPreferences({ getItem: () => { throw new Error("disabled") } })).toEqual(defaultSearchPreferences())
    expect(saveSearchPreferences(selected(), { setItem: () => { throw new Error("quota") } })).toBe(false)
  })
  it("중복 값·사이트 순서·문자 공백을 정리하고 호출자 객체를 수정하지 않는다", () => {
    const input = selected()
    input.query = "  React  "
    input.filters = { ...input.filters, role: ["frontend", "frontend"] }
    input.sites = ["jobkorea", "saramin", "jobkorea"]
    const before = structuredClone(input)
    expect(saveSearchPreferences(input)).toBe(true)
    expect(readSearchPreferences()).toMatchObject({ query: "React", filters: { role: ["frontend"] }, sites: ["saramin", "jobkorea"] })
    expect(input).toEqual(before)
  })
  it("기본값의 중첩 배열을 공유하지 않는다", () => {
    const one = defaultSearchPreferences(), two = defaultSearchPreferences()
    one.sites.pop()
    expect(two.sites).toHaveLength(3)
    expect(one.filters.role).not.toBe(two.filters.role)
  })
})
