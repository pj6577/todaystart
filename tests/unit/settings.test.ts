import { expect, it } from "vitest"
import { defaultSettings, resolveSettings } from "../../src/storage/settings"
import { fixtureProfile } from "../helpers"

it("새 설치는 등록된 플랫폼 수집과 자동 기록이 기본으로 켜진다", () => {
  expect(resolveSettings(undefined)).toMatchObject({ settingsVersion: 3, theme: "system", autoRecord: true, historyAutoCollect: false, consent: { saramin: true, jobkorea: true, wanted: true } })
})
it("기존 설정에 별도 가져오기 선택이 없으면 끄고 명시적으로 켠 선택은 유지한다", () => {
  const { historyAutoCollect, ...old } = defaultSettings
  expect(resolveSettings(old).historyAutoCollect).toBe(false)
  expect(resolveSettings({ ...old, historyAutoCollect: true }).historyAutoCollect).toBe(true)
})
it("기존 기본 꺼짐 설정은 한 번 켜짐으로 이전하고 기록 관련 설정을 보존한다", () => {
  const { settingsVersion, theme, ...legacy } = defaultSettings
  const profile = fixtureProfile("saramin")
  expect(resolveSettings({ ...legacy, consent: { saramin: false, jobkorea: false }, listingWarnings: false, profiles: { saramin: profile } })).toMatchObject({
    settingsVersion: 3, theme: "system", consent: { saramin: true, jobkorea: true, wanted: true }, listingWarnings: false, profiles: { saramin: profile }
  })
})
it("이전 후 사용자가 끈 수집 설정을 다시 켜지 않는다", () => {
  const settings = { ...defaultSettings, autoRecord: false, consent: { saramin: false, jobkorea: true, wanted: false, remember: false }, theme: "dark" as const }
  expect(resolveSettings(settings)).toEqual(settings)
  expect(resolveSettings(resolveSettings(settings))).toEqual(settings)
})
it("기존 두 플랫폼 선택을 보존하고 새 원티드만 켠다", () => {
  const previous = { ...defaultSettings, settingsVersion: 2, consent: { saramin: false, jobkorea: false }, theme: "dark" }
  expect(resolveSettings(previous)).toMatchObject({ settingsVersion: 3, theme: "dark", consent: { saramin: false, jobkorea: false, wanted: true } })
})
it("기본 설정 반환값이 원본과 공유되지 않는다", () => {
  const settings = resolveSettings(undefined)
  settings.consent.saramin = false
  expect(resolveSettings(undefined).consent.saramin).toBe(true)
})
it("기존 세 사이트 선택과 메모 설정을 보존하며 새 리멤버만 켠다", () => {
  const old = { ...defaultSettings, historyAutoCollect: true, autoRecord: false, theme: "dark", consent: { saramin: false, jobkorea: true, wanted: false } }
  expect(resolveSettings(old)).toMatchObject({ autoRecord: false, historyAutoCollect: true, theme: "dark", consent: { saramin: false, jobkorea: true, wanted: false, remember: true } })
})
