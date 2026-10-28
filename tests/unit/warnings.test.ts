import { afterEach, expect, it } from "vitest"
import { WarningInjector } from "../../src/ui/warnings"
import type { CompanyMatch, JobPosting } from "../../src/core/model"
import { record } from "../helpers"

afterEach(() => { document.body.innerHTML = "" })
const found: CompanyMatch[] = [{ record: record(), confidence: "exact", reason: "기업명 일치" }]
const posting = (element: Element): JobPosting => ({ platform: "jobkorea", companyName: "헌터협회", jobTitle: "개발자", element })

it("목록 카드 내부의 맨 위에 이력을 배치한다", () => {
  document.body.innerHTML = '<article><h2>공고</h2></article>'
  const card = document.querySelector("article")!
  new WarningInjector().render([posting(card)], () => found, false)
  expect(card.firstElementChild?.tagName).toBe("TODAYSTART-WARNING")
  expect(card.firstElementChild?.getAttribute("data-placement")).toBe("card-top")
})

it("사이트가 이력 안내가 있는 카드를 복제해도 각 카드의 안내는 한 개만 유지한다", () => {
  document.body.innerHTML = '<article><h2>공고</h2></article>'
  const first = document.querySelector("article")!
  const injector = new WarningInjector()
  injector.render([posting(first)], () => found, false)
  const clone = first.cloneNode(true) as Element
  document.body.append(clone)
  injector.render([posting(first), posting(clone)], () => found, false)
  const hosts = [...document.querySelectorAll("todaystart-warning")]
  expect(hosts).toHaveLength(2)
  expect(hosts.every(host => !!host.shadowRoot?.querySelector("summary"))).toBe(true)
})

it("표에서는 안내를 공고 위의 정상 tr/td로 삽입한다", () => {
  document.body.innerHTML = '<table><tbody><tr><td>기업</td><td>공고</td></tr></tbody></table>'
  const row = document.querySelector("tr")!
  new WarningInjector().render([posting(row)], () => found, false)
  expect(row.previousElementSibling?.tagName).toBe("TR")
  expect(row.previousElementSibling?.querySelector("td")?.colSpan).toBe(2)
  expect(row.previousElementSibling?.querySelector("todaystart-warning")).not.toBeNull()
})

it("상세 페이지의 같은 위치에서 삽입기가 다시 실행돼도 기존 안내를 갱신한다", () => {
  document.body.innerHTML = '<header><h1>공고</h1></header>'
  const header = document.querySelector("header")!
  const first = new WarningInjector(), second = new WarningInjector()
  first.render([posting(header)], () => found, true)
  const host = document.querySelector("todaystart-warning")!
  second.render([posting(header)], () => found, true)
  expect(document.querySelectorAll("todaystart-warning")).toHaveLength(1)
  expect(document.querySelector("todaystart-warning")).toBe(host)
  second.render([posting(header)], () => [{ ...found[0]!, record: record({ jobTitle: "갱신된 직무" }) }], true)
  expect(document.querySelectorAll("todaystart-warning")).toHaveLength(1)
  expect(host.shadowRoot?.textContent).toContain("갱신된 직무")
})

it("상세 안내가 복제되면 변경 없는 갱신에서도 복구 필요를 감지하고 하나만 남긴다", () => {
  document.body.innerHTML = '<header><h1>공고</h1></header>'
  const header = document.querySelector("header")!, injector = new WarningInjector()
  injector.render([posting(header)], () => found, true)
  const host = document.querySelector("todaystart-warning")!
  host.after(host.cloneNode(true))
  expect(injector.needsRepair()).toBe(true)
  injector.render([posting(header)], () => found, true)
  expect(document.querySelectorAll("todaystart-warning")).toHaveLength(1)
  expect(document.querySelector("todaystart-warning")).toBe(host)
  expect(injector.needsRepair()).toBe(false)
})

it("표와 목록의 감싸는 노드도 재실행 시 중복하지 않는다", () => {
  document.body.innerHTML = '<table><tbody><tr><td>공고</td></tr></tbody></table><ul><li id="posting">공고</li></ul>'
  const row = document.querySelector("tr")!, item = document.querySelector("#posting")!
  const first = new WarningInjector(), second = new WarningInjector()
  first.render([posting(row), posting(item)], () => found, true)
  second.render([posting(row), posting(item)], () => found, true)
  expect(document.querySelectorAll("todaystart-warning")).toHaveLength(2)
  expect(document.querySelectorAll('[data-todaystart-owned="warning-row"]')).toHaveLength(1)
  expect(document.querySelectorAll('[data-todaystart-owned="warning-item"]')).toHaveLength(1)
})

it("안내 위치가 새 헤더로 넘어가도 재사용한 안내를 이전 헤더 정리 중 삭제하지 않는다", () => {
  document.body.innerHTML = '<header><h1>공고</h1></header>'
  const header = document.querySelector("header")!, injector = new WarningInjector()
  injector.render([posting(header)], () => found, true)
  const host = document.querySelector("todaystart-warning")!, replacement = header.cloneNode(true) as Element
  header.replaceWith(replacement)
  injector.render([posting(replacement)], () => found, true)
  expect(document.querySelectorAll("todaystart-warning")).toHaveLength(1)
  expect(document.querySelector("todaystart-warning")).toBe(host)
  expect(host.isConnected).toBe(true)
})

it("목록에서 상세 보기로 바꾸면 안내를 펼치고 이후 갱신에서는 사용자의 접기 상태를 유지한다", () => {
  document.body.innerHTML = '<article><h1>공고</h1></article>'
  const card = document.querySelector("article")!, injector = new WarningInjector()
  injector.render([posting(card)], () => found, false)
  injector.render([posting(card)], () => found, true)
  const details = document.querySelector("todaystart-warning")!.shadowRoot!.querySelector("details")!
  expect(details.open).toBe(true)
  details.open = false
  injector.setTheme("dark")
  injector.render([posting(card)], () => found, true)
  expect(document.querySelector("todaystart-warning")!.shadowRoot!.querySelector("details")!.open).toBe(false)
})
it("keeps diagnostic match codes out of exact-match guidance and explains uncertain names plainly", () => {
  document.body.innerHTML = '<article><h2>공고</h2></article>'
  const card = document.querySelector("article")!
  const injector = new WarningInjector()
  injector.render([posting(card)], () => found, false)
  const exact = card.querySelector("todaystart-warning")!.shadowRoot!
  expect(exact.textContent).not.toContain("exact ·")
  expect(exact.querySelector("small")).toBeNull()
  injector.render([posting(card)], () => [{ ...found[0]!, confidence: "possible" }], false)
  expect(card.querySelector("todaystart-warning")!.shadowRoot!.querySelector("small")?.textContent).toBe("이름이 비슷한 기업의 기록이에요. 같은 기업인지 확인해 주세요.")
})
