import { describe, expect, it } from "vitest"
import { searchPlatforms } from "../../src/search/model"
import { moveSearchPlatform, readSearchPlatformOrder, saveSearchPlatformOrder, searchPlatformOrderKey } from "../../src/search/platform-order"

describe("검색 플랫폼 표시 순서", () => {
  it("기본 순서는 사람인·잡코리아·원티드·리멤버이며 반환 배열을 공유하지 않는다", () => {
    const first = readSearchPlatformOrder({ getItem: () => null })
    first.reverse()
    expect(readSearchPlatformOrder({ getItem: () => null })).toEqual(searchPlatforms)
  })
  it("전체 플랫폼의 순서만 별도 키에 저장하고 복원한다", () => {
    const stored = new Map<string, string>()
    const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value) } }
    const order = ["wanted", "remember", "saramin", "jobkorea"] as const
    expect(saveSearchPlatformOrder(order, storage)).toBe(true)
    expect([...stored.keys()]).toEqual([searchPlatformOrderKey])
    expect(JSON.parse(stored.get(searchPlatformOrderKey)!)).toEqual({ version: 1, platforms: order })
    expect(readSearchPlatformOrder(storage)).toEqual(order)
  })
  it.each([null, [], ["saramin"], ["all", "saramin", "wanted", "remember"], ["evil", "jobkorea", "wanted", "remember"], ["wanted", "wanted", "saramin", "remember"], [...searchPlatforms, "wanted"]])("중복·누락·알 수 없는 플랫폼을 저장하지 않는다: %j", order => {
    let wrote = false
    expect(saveSearchPlatformOrder(order as never, { setItem: () => { wrote = true } })).toBe(false)
    expect(wrote).toBe(false)
  })
  it.each(["bad-json", "null", JSON.stringify({ version: 2, platforms: searchPlatforms }), JSON.stringify({ version: 1, platforms: ["wanted"] }), JSON.stringify({ version: 1, platforms: searchPlatforms, jobs: ["unexpected"] })])("깨진 저장값은 기본 순서로 읽고 쓰지 않는다: %s", raw => {
    expect(readSearchPlatformOrder({ getItem: () => raw })).toEqual(searchPlatforms)
  })
  it("한 플랫폼만 목표 위치로 옮기며 나머지 상대 순서와 원본을 유지한다", () => {
    const order = [...searchPlatforms]
    expect(moveSearchPlatform(order, "remember", "saramin")).toEqual(["remember", "saramin", "jobkorea", "wanted"])
    expect(moveSearchPlatform(order, "saramin", "wanted")).toEqual(["jobkorea", "wanted", "saramin", "remember"])
    expect(moveSearchPlatform(order, "wanted", "wanted")).toEqual(order)
    expect(moveSearchPlatform(order, "evil" as never, "wanted")).toEqual(order)
    expect(order).toEqual(searchPlatforms)
  })
  it("저장소 읽기 실패는 기본값으로 복구하고 쓰기 실패는 성공으로 처리하지 않는다", () => {
    expect(readSearchPlatformOrder({ getItem: () => { throw Error("disabled") } })).toEqual(searchPlatforms)
    expect(saveSearchPlatformOrder(searchPlatforms, { setItem: () => { throw Error("quota") } })).toBe(false)
  })
})
