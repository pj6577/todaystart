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
