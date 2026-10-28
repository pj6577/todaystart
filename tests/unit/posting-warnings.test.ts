import { afterEach, expect, it } from "vitest"
import { PostingWarnings } from "../../src/platforms/posting-warnings"
import { defaultSettings } from "../../src/storage/settings"
import type { JobPosting } from "../../src/core/model"
import { record } from "../helpers"

afterEach(() => { document.body.innerHTML = "" })
function fixture() {
  document.body.innerHTML = '<header><h1>job</h1></header>'
  const postings: JobPosting[] = [{ platform: "saramin", companyName: "헌터협회", jobTitle: "개발자", element: document.querySelector("header")! }]
  return { warnings: new PostingWarnings(), postings }
}

it("still matches and saves the latest presentation for rendering after the native layer closes", () => {
  const { warnings, postings } = fixture()
  warnings.render(postings, [], defaultSettings, "detail")
  const records = [record()]
  expect(warnings.render(postings, records, defaultSettings, "detail", true).matches).toBe(1)
  expect(document.querySelector("todaystart-warning")).toBeNull()
  warnings.render(postings, records, defaultSettings, "detail")
  expect(document.querySelector("todaystart-warning")?.shadowRoot?.textContent).toContain("사람인 지원 이력 있음")
})

it("keeps an existing notice intact while records/theme/settings change, then renders the latest state", () => {
  const { warnings, postings } = fixture()
  warnings.render(postings, [record()], defaultSettings, "detail")
  const host = document.querySelector("todaystart-warning")!
  const updated = [record({ jobTitle: "updated job" })]
  warnings.setTheme("dark")
  warnings.render(postings, updated, defaultSettings, "detail", true)
  expect(document.querySelector("todaystart-warning")).toBe(host)
  expect(host.shadowRoot?.textContent).not.toContain("updated job")
  warnings.render(postings, updated, defaultSettings, "detail")
  expect(document.querySelector("todaystart-warning")?.getAttribute("data-theme")).toBe("dark")
  expect(document.querySelector("todaystart-warning")?.shadowRoot?.textContent).toContain("updated job")
  const disabled = { ...defaultSettings, detailWarnings: false }
  warnings.render(postings, [], disabled, "detail", true)
  expect(document.querySelector("todaystart-warning")).not.toBeNull()
  warnings.render(postings, [], disabled, "detail")
  expect(document.querySelector("todaystart-warning")).toBeNull()
})
