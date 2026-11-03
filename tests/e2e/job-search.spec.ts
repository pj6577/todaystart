import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test"
import path from "node:path"
import { mkdirSync } from "node:fs"
import { jobGroups, developmentRoles, searchRegions, searchCareers } from "../../src/search/filters"
import { record } from "../helpers"
import { jobSearchPreferencesKey } from "../../src/search/preferences"

let context: BrowserContext, ui: Page
test.beforeEach(async () => {
  const extension = path.resolve(process.env.TODAYSTART_TEST_EXTENSION_DIR || "build/chrome-mv3-prod")
  context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, viewport: { width: 1440, height: 1000 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] })
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker")
  ui = await context.newPage()
  await ui.goto(`chrome-extension://${new URL(worker.url()).host}/options.html#search`)
  await expect(ui.getByRole("heading", { name: "공고 통합검색", exact: true })).toBeVisible()
  // These legacy scenarios exercise the original three sources. Preserve an
  // explicit saved selection, and stub Remember for cases that reset all sites.
  await context.route("https://career-api.rememberapp.co.kr/**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [], meta: { page: route.request().postDataJSON()?.page ?? 1, total_pages: 0 } }) }))
  await ui.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, query: "", filters: { group: [], role: [], region: [], career: [] }, sites: ["saramin", "jobkorea", "wanted"], excludeApplied: false })), jobSearchPreferencesKey)
  await ui.reload()
  await expect(ui.getByRole("heading", { name: "공고 통합검색", exact: true })).toBeVisible()
})
test.afterEach(async () => { await context.close() })

const saramin = (ids = [101, 102], prefix = "사람인", next = 0) => `<main id="recruit_info_list">${ids.map(id => `<div class="item_recruit"><div class="area_corp"><span class="corp_name"><a>예시기업 ${id}</a></span></div><div class="area_job"><h2 class="job_tit"><a href="/zf_user/jobs/relay/view?rec_idx=${id}&search_uuid=PRIVATE_TRACKING">${prefix} 공고 ${id}</a></h2></div><div class="job_condition"><span>서울</span><span>경력무관</span></div><div class="job_date"><span class="date">상시채용</span></div></div>`).join("")}${next ? `<div class="pagination"><a page="${next}">${next}</a></div>` : ""}</main>`
const jobkorea = `<main><div data-sentry-component="CardJob"><a href="/Recruit/GI_Read/201"><span>예시기업 201</span></a><a data-sentry-component="Title" href="/Recruit/GI_Read/201?Oem_Code=PRIVATE_TRACKING"><span>잡코리아 공고 201</span></a><div data-sentry-component="GrayChip">경기</div><span>경력무관</span></div></main>`
const wanted = { data: [{ id: 301, position: "원티드 공고 301", company: { name: "예시기업 301" }, annual_from: 1, annual_to: 3 }], links: { next: null } }
const countRecords = () => ui.evaluate(async () => (await chrome.runtime.sendMessage({ type: "snapshot" })).data.records.length)
const resultFilter = (name: string) => ui.getByRole("navigation", { name: "검색 결과 사이트 필터" }).getByRole("button", { name: new RegExp(name) })
async function mockSmallSearch() {
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    const host = new URL(route.request().url()).hostname
    await route.fulfill({ contentType: host.includes("wanted") ? "application/json" : "text/html; charset=utf-8", body: host.includes("saramin") ? saramin() : host.includes("jobkorea") ? jobkorea : JSON.stringify(wanted) })
  })
}
async function selectSaraminAndJobkorea() {
  await ui.getByRole("button", { name: "검색 사이트", exact: true }).click()
  await ui.getByRole("checkbox", { name: "원티드", exact: true }).uncheck()
  await ui.getByRole("dialog", { name: "필터 선택", exact: true }).getByRole("button", { name: "적용", exact: true }).click()
}
async function chooseFilter(name: string, value: string) {
  const options = name === "직군" ? jobGroups : name === "개발 세부 직무" ? developmentRoles : name === "근무 지역" ? searchRegions : searchCareers
  const label = options.find(option => option.id === value)!.label
  const panelName = name === "직군" || name === "개발 세부 직무" ? "직군·직무" : name === "근무 지역" ? "지역" : "경력"
  await ui.getByRole("button", { name: panelName, exact: true }).click()
  const panel = ui.getByRole("dialog", { name: "필터 선택", exact: true })
  if (name === "직군") {
    await panel.getByRole("radio", { name: label, exact: true }).locator("..").click()
    await panel.getByRole("checkbox", { name: value === "all" ? label : `${label} 전체`, exact: true }).locator("..").click()
  } else await panel.getByRole("checkbox", { name: name === "경력" ? `${label} 포함` : label, exact: true }).locator("..").click()
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await expect(ui.locator(".job-search-demo")).toHaveAttribute("aria-busy", "false")
}

test("세 사이트 직접 검색·필터·원문 링크, 지원 기록과 저장소 분리", async () => {
  const requests: { url: string; method: string; cookie?: string }[] = []
  await context.addCookies([{ name: "private_cookie", value: "DO_NOT_SEND", domain: ".saramin.co.kr", path: "/", secure: true }])
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    const request = route.request(), url = new URL(request.url())
    requests.push({ url: request.url(), method: request.method(), cookie: (await request.allHeaders()).cookie })
    await route.fulfill({ contentType: url.hostname.includes("wanted") ? "application/json" : "text/html; charset=utf-8", body: url.hostname.includes("saramin") ? saramin() : url.hostname.includes("jobkorea") ? jobkorea : JSON.stringify(wanted) })
  })
  const before = await countRecords(), pages = context.pages().length
  expect(requests).toHaveLength(0)
  await ui.getByRole("searchbox", { name: "채용공고 검색어" }).fill("프론트엔드")
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(4)
  await expect(ui.getByText("현재 검색 결과의 끝이에요")).toBeVisible()
  expect(requests).toHaveLength(3)
  expect(requests.every(request => request.method === "GET" && !request.cookie)).toBe(true)
  expect(context.pages()).toHaveLength(pages)
  expect(await countRecords()).toBe(before)
  const links = await ui.locator(".job-search-card h3 a").evaluateAll(links => links.map(link => link.getAttribute("href")))
  expect(links.join(" ")).not.toMatch(/PRIVATE_TRACKING|search_uuid|Oem_Code/)
  await resultFilter("원티드").click()
  await expect(ui.locator(".job-search-card")).toHaveCount(1)
  await resultFilter("전체").click()
  await expect(ui.locator(".job-search-card")).toHaveCount(4)
  const stored = await ui.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }))
  expect(JSON.stringify(stored)).not.toMatch(/사람인 공고|잡코리아 공고|원티드 공고/)
  await expect(ui.locator(".job-search-site-grid,.job-search-pagination")).toHaveCount(0)
  await expect(ui.getByText("검색할 때 선택한 사이트에 직접 요청해요. 결과는 이 화면에만 보관해요.")).toHaveCount(0)
  await ui.setViewportSize({ width: 520, height: 900 })
  expect(await ui.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test("일부 사이트 실패와 재시도는 다른 검색 결과를 유지하고 자동 재시도하지 않는다", async () => {
  let calls = 0, blocked = true
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    calls++
    const host = new URL(route.request().url()).hostname
    await route.fulfill({ status: host.includes("jobkorea") && blocked ? 429 : 200, contentType: host.includes("wanted") ? "application/json" : "text/html; charset=utf-8", body: host.includes("saramin") ? saramin() : host.includes("jobkorea") ? jobkorea : JSON.stringify(wanted) })
  })
  await ui.getByRole("searchbox", { name: "채용공고 검색어" }).fill("React")
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  const failure = ui.getByRole("status", { name: "잡코리아 검색 문제" })
  await expect(failure).toContainText("접근 제한")
  await expect(ui.locator(".job-search-card")).toHaveCount(3)
  await ui.locator(".job-search-scroll-end").scrollIntoViewIfNeeded()
  await expect(ui.getByText("현재 검색 결과의 끝이에요")).toBeVisible()
  expect(calls).toBe(3)
  blocked = false
  await failure.getByRole("button", { name: "다시 시도" }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(4)
  expect(calls).toBe(4)
})

test("새 검색과 중지는 이전 응답이 현재 결과를 덮어쓰지 않게 한다", async () => {
  const releases: (() => void)[] = []
  let held = 0
  await context.route("https://www.saramin.co.kr/**", async route => {
    const query = new URL(route.request().url()).searchParams.get("searchword")!
    if (query !== "fast") { held++; await new Promise<void>(resolve => releases.push(resolve)) }
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: saramin([query === "fast" ? 501 : 999], query) }).catch(() => {})
  })
  await ui.getByRole("button", { name: "검색 사이트", exact: true }).click()
  await ui.getByRole("checkbox", { name: "잡코리아" }).uncheck()
  await ui.getByRole("checkbox", { name: "원티드" }).uncheck()
  await ui.getByRole("dialog", { name: "필터 선택", exact: true }).getByRole("button", { name: "적용", exact: true }).click()
  const input = ui.getByRole("searchbox", { name: "채용공고 검색어" })
  await input.fill("slow")
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  await expect.poll(() => held).toBe(1)
  await input.fill("fast")
  await ui.getByRole("button", { name: "새로 검색" }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(1)
  releases.shift()!()
  await expect(ui.locator(".job-search-card")).toContainText("fast 공고")
  await input.fill("stop")
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  await expect.poll(() => held).toBe(2)
  await ui.getByRole("button", { name: "검색 중지" }).click()
  releases.shift()!()
  await expect(ui.getByText("검색을 중지했어요")).toBeVisible()
  await expect(ui.locator(".job-search-card")).toHaveCount(0)
})

test("조건 선택·3열 가운데 정렬·무한 스크롤·플랫폼 묶음 순서와 검색 조건 유지", async () => {
  await selectSaraminAndJobkorea()
  const requests: URL[] = []
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    const url = new URL(route.request().url()); requests.push(url)
    const page = Number(url.searchParams.get("recruitPage") || url.searchParams.get("Page_No") || 1)
    const ids = Array.from({ length: 20 }, (_, index) => page * 1000 + index)
    const body = url.hostname.includes("saramin") ? saramin(ids, "사람인", page === 1 ? 2 : 0)
      : `<main>${ids.map(id => jobkorea.replace(/<\/?main>/g, "").replace(/201/g, String(id))).join("")}${page === 1 ? '<a href="?Page_No=2">2</a>' : ""}</main>`
    await route.fulfill({ contentType: "text/html; charset=utf-8", body })
  })
  await chooseFilter("직군", "development")
  await chooseFilter("개발 세부 직무", "frontend")
  await chooseFilter("근무 지역", "seoul")
  await chooseFilter("경력", "new")
  requests.length = 0
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(40)
  await expect(ui.locator(".job-search-result-heading")).toHaveCount(0)
  await expect(resultFilter("전체")).toHaveText("전체")
  expect(requests).toHaveLength(2)
  expect(Object.fromEntries(requests.find(url => url.hostname.includes("saramin"))!.searchParams)).toMatchObject({ cat_kewd: "92", loc_mcd: "101000", exp_cd: "1", searchword: "" })
  expect(Object.fromEntries(requests.find(url => url.hostname.includes("jobkorea"))!.searchParams)).toMatchObject({ duty: "1000230", local: "I000", careerType: "1", stext: "" })
  const firstLinks = await ui.locator(".job-search-card h3 a").evaluateAll(links => links.map(link => link.getAttribute("href")))
  const boxes = await ui.locator(".job-search-card").evaluateAll(cards => cards.slice(0, 4).map(card => { const box = card.getBoundingClientRect(); return { x: box.x, y: box.y } }))
  expect(boxes[0]!.y).toBe(boxes[1]!.y); expect(boxes[1]!.y).toBe(boxes[2]!.y)
  expect(boxes[2]!.x).toBeGreaterThan(boxes[1]!.x); expect(boxes[3]!.y).toBeGreaterThan(boxes[0]!.y)
  expect(await ui.evaluate(() => {
    const workspace = document.querySelector(".workspace")!.getBoundingClientRect(), results = document.querySelector(".job-search-demo")!.getBoundingClientRect()
    return Math.abs((workspace.left + workspace.right) / 2 - (results.left + results.right) / 2)
  })).toBeLessThanOrEqual(1)
  await ui.getByRole("button", { name: "지역", exact: true }).click()
  await ui.getByRole("checkbox", { name: "부산", exact: true }).locator("..").click()
  await ui.getByRole("dialog", { name: "필터 선택", exact: true }).getByRole("button", { name: "취소", exact: true }).click()
  await ui.locator(".job-search-scroll-end").scrollIntoViewIfNeeded()
  await expect(ui.locator(".job-search-card")).toHaveCount(80)
  expect(requests).toHaveLength(4)
  expect(requests.slice(2).every(url => url.searchParams.get("loc_mcd") === "101000" || url.searchParams.get("local") === "I000")).toBe(true)
  const nextLinks = await ui.locator(".job-search-card h3 a").evaluateAll(links => links.map(link => link.getAttribute("href")))
  expect(nextLinks.slice(0, 40)).toEqual(firstLinks)
  expect(nextLinks.slice(40, 60).every(link => new URL(link!).hostname === "www.saramin.co.kr")).toBe(true)
  expect(nextLinks.slice(60).every(link => new URL(link!).hostname === "www.jobkorea.co.kr")).toBe(true)
  await ui.locator(".job-search-scroll-end").scrollIntoViewIfNeeded()
  await expect(ui.getByText("현재 검색 결과의 끝이에요")).toBeVisible()
  expect(requests).toHaveLength(4)
  await resultFilter("잡코리아").click()
  await expect(ui.locator(".job-search-card")).toHaveCount(40)
  mkdirSync(".tmp/search-demo", { recursive: true })
  for (const theme of ["dark", "light"]) {
    await ui.evaluate(theme => { document.documentElement.dataset.theme = theme; window.scrollTo(0, 0) }, theme)
    await ui.evaluate(() => document.getAnimations().forEach(animation => animation.finish()))
    await ui.screenshot({ path: `.tmp/search-demo/filters-${theme}.png` })
  }
  await ui.getByRole("button", { name: "전체 초기화", exact: true }).click()
  await expect(ui.getByRole("button", { name: "직군·직무", exact: true })).toHaveAttribute("aria-description", "전체 직군")
  await expect(ui.locator(".search-selected-filters")).toHaveCount(0)
  await ui.setViewportSize({ width: 520, height: 900 })
  expect(await ui.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  for (const width of [1440, 520, 390]) {
    await ui.setViewportSize({ width, height: 900 })
    const positions = await ui.evaluate(() => ({
      search: document.querySelector(".job-search-input")!.getBoundingClientRect().left,
      condition: document.querySelector(".search-filter-trigger")!.getBoundingClientRect().left,
      checkbox: document.querySelector(".job-search-exclude input")!.getBoundingClientRect().left,
      checkboxRight: document.querySelector(".job-search-exclude")!.getBoundingClientRect().right,
      searchRight: document.querySelector(".job-search-input")!.getBoundingClientRect().right,
      overflow: document.documentElement.scrollWidth > window.innerWidth
    }))
    expect(Math.abs(positions.search - positions.condition)).toBeLessThanOrEqual(1)
    if (width === 1440) expect(Math.abs(positions.searchRight - positions.checkboxRight)).toBeLessThanOrEqual(1)
    else expect(Math.abs(positions.search - positions.checkbox)).toBeLessThanOrEqual(1)
    expect(positions.overflow).toBe(false)
  }
  await ui.evaluate(() => window.scrollTo(0, 0))
  await ui.screenshot({ path: ".tmp/search-demo/filters-mobile.png" })
})

test("직군·직무 패널은 키보드 선택·적용·Escape 취소와 포커스 복귀를 지원한다", async () => {
  await mockSmallSearch()
  const trigger = ui.getByRole("button", { name: "직군·직무", exact: true })
  await trigger.focus(); await ui.keyboard.press("Enter")
  const panel = ui.getByRole("dialog", { name: "필터 선택", exact: true })
  await panel.getByRole("radio", { name: "전체 직군", exact: true }).focus()
  await ui.keyboard.press("ArrowDown")
  await expect(panel.getByRole("radio", { name: "IT개발·데이터", exact: true })).toBeChecked()
  await ui.keyboard.press("Escape")
  await expect(trigger).toHaveAttribute("aria-expanded", "false"); await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute("aria-description", "전체 직군")
  await chooseFilter("직군", "development")
  await trigger.click()
  await panel.getByRole("searchbox", { name: "세부 직무 검색" }).fill("프론트")
  await panel.getByRole("checkbox", { name: "프론트엔드", exact: true }).locator("..").click()
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await expect(ui.getByRole("button", { name: "프론트엔드 조건 해제", exact: true })).toBeVisible()
  await expect(trigger).toBeFocused()
})

test("로컬 지원 완료 이력을 다른 사이트 공고와 비교하고 지원 취소·대기는 표시하지 않는다", async () => {
  let requests = 0
  const records = [
    record({ id: "old", companyName: "(주)예시기업 101", jobTitle: "이전 개발 직무", appliedAt: "2026-10-20", jobUrl: "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=901" }),
    record({ id: "cross", platform: "manual", companyName: "예시기업101", jobTitle: "다른 경로의 지원", appliedAt: "2026-10-21" }),
    record({ id: "cancel", companyName: "예시기업102", status: "cancelled" }),
    record({ id: "pending", companyName: "예시기업201", status: "pending_confirmation" })
  ]
  await ui.evaluate(async records => {
    const result = await chrome.runtime.sendMessage({ type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records } })
    if (!result.ok) throw new Error(JSON.stringify(result))
  }, records)
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    requests++
    const host = new URL(route.request().url()).hostname
    await route.fulfill({ contentType: host.includes("wanted") ? "application/json" : "text/html; charset=utf-8", body: host.includes("saramin") ? saramin() : host.includes("jobkorea") ? jobkorea : JSON.stringify(wanted) })
  })
  await ui.getByRole("searchbox", { name: "채용공고 검색어" }).fill("개발")
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(4)
  await expect(ui.locator(".job-search-applied-badge")).toHaveCount(1)
  const card = ui.locator(".job-search-card").filter({ has: ui.getByText("예시기업 101", { exact: true }) })
  const badge = card.getByRole("button", { name: "지원 이력 있음", exact: true })
  await badge.click()
  const dialog = ui.getByRole("dialog", { name: "이전 지원 내역", exact: true })
  await expect(dialog.locator(".search-history-entry h3")).toHaveText(["다른 경로의 지원", "이전 개발 직무"])
  await expect(dialog).toContainText("2026-10-21")
  await expect(dialog.getByRole("link", { name: "지원 공고 보기", exact: true })).toHaveCount(1)
  await ui.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0); await expect(badge).toBeFocused()
  await ui.getByRole("checkbox", { name: "지원 기업 제외하기" }).check()
  await expect(ui.locator(".job-search-card")).toHaveCount(3)
  await expect(ui.locator(".job-search-applied-badge")).toHaveCount(0)
  await expect(resultFilter("전체")).toHaveAttribute("data-result-count", "3")
  await expect(resultFilter("사람인")).toHaveAttribute("data-result-count", "1")
  await ui.getByRole("checkbox", { name: "지원 기업 제외하기" }).uncheck()
  await expect(ui.locator(".job-search-card")).toHaveCount(4)
  await expect(ui.locator(".job-search-applied-badge")).toHaveCount(1)
  expect(requests).toBe(3)
  expect(await countRecords()).toBe(4)
})

test("원티드의 아인잡 영문 병기를 잡코리아 지원 기록에 연결하고 배지와 제외에 같이 반영한다", async () => {
  const saved = record({ platform: "jobkorea", companyName: "㈜아인잡", jobTitle: "자사 HR Platform 서비스 개발팀장", appliedAt: "2026-10-29", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/901" })
  await ui.evaluate(async record => {
    const result = await chrome.runtime.sendMessage({ type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [record] } })
    if (!result.ok) throw new Error(JSON.stringify(result))
  }, saved)
  const snapshot = () => ui.evaluate(async () => (await chrome.runtime.sendMessage({ type: "snapshot" })).data.records)
  const before = await snapshot()
  let requests = 0
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    requests++
    const host = new URL(route.request().url()).hostname
    const companies = ["아인잡(AINJOB)", "아인잡홀딩스", "아인잡(부산)", "다른기업(AINJOB)"]
    const wantedJobs = { data: companies.map((name, index) => ({ id: 301 + index, position: index ? "별개 공고" : "WEB Front 개발 리더 (3~5년)", company: { name } })), links: { next: null } }
    await route.fulfill({ contentType: host.includes("wanted") ? "application/json" : "text/html; charset=utf-8", body: host.includes("saramin") ? saramin() : host.includes("jobkorea") ? jobkorea.replace("예시기업 201", "㈜아인잡") : JSON.stringify(wantedJobs) })
  })
  await ui.getByRole("searchbox", { name: "채용공고 검색어" }).fill("개발")
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(7)
  await expect(ui.locator(".job-search-applied-badge")).toHaveCount(2)
  for (const company of ["아인잡(AINJOB)", "㈜아인잡"]) {
    const card = ui.locator(".job-search-card").filter({ has: ui.getByText(company, { exact: true }) })
    await expect(card.getByText("지원 이력 있음", { exact: true })).toBeVisible()
    await card.getByRole("button", { name: "지원 이력 있음", exact: true }).click()
    const dialog = ui.getByRole("dialog", { name: "이전 지원 내역", exact: true })
    await expect(dialog).toContainText(company)
    await expect(dialog).toContainText("자사 HR Platform 서비스 개발팀장")
    await expect(dialog).toContainText("잡코리아")
    await expect(dialog).toContainText("2026-10-29")
    await expect(dialog.getByRole("link", { name: "지원 공고 보기", exact: true })).toHaveAttribute("href", "https://www.jobkorea.co.kr/Recruit/GI_Read/901")
    await dialog.getByRole("button", { name: "닫기", exact: true }).click()
  }
  await ui.getByRole("checkbox", { name: "지원 기업 제외하기" }).check()
  await expect(ui.locator(".job-search-card")).toHaveCount(5)
  await expect(ui.locator(".job-search-applied-badge")).toHaveCount(0)
  await expect(resultFilter("원티드")).toHaveAttribute("data-result-count", "3")
  await expect(resultFilter("잡코리아")).toHaveAttribute("data-result-count", "0")
  await ui.getByRole("checkbox", { name: "지원 기업 제외하기" }).uncheck()
  await expect(ui.locator(".job-search-applied-badge")).toHaveCount(2)
  expect(requests).toBe(3)
  expect(await snapshot()).toEqual(before)
})

test("지원 이력 배지는 최근순 모달을 열며 많은 내역은 내부 스크롤하고 원래 버튼으로 복귀한다", async () => {
  const records = Array.from({ length: 14 }, (_, index) => record({
    id: `history-${index}`, platform: index === 13 ? "manual" : index % 2 ? "wanted" : "jobkorea",
    companyName: "㈜예시기업 101", jobTitle: `이전 직무 ${index + 1}`, sourceJobId: String(800 + index),
    appliedAt: index === 13 ? undefined : `2026-10-${String(index + 1).padStart(2, "0")}`,
    jobUrl: index >= 11 ? undefined : index % 2 ? `https://www.wanted.co.kr/wd/${800 + index}` : `https://www.jobkorea.co.kr/Recruit/GI_Read/${800 + index}`,
    collectedAt: index === 13 ? "2026-11-02T00:00:00.000Z" : "2026-10-01T00:00:00.000Z"
  }))
  await ui.evaluate(async records => {
    const result = await chrome.runtime.sendMessage({ type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records } })
    if (!result.ok) throw new Error(JSON.stringify(result))
  }, records)
  await mockSmallSearch()
  await ui.getByRole("searchbox", { name: "채용공고 검색어" }).fill("개발")
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  const badge = ui.getByRole("button", { name: "지원 이력 있음", exact: true })
  await expect(badge).toHaveAttribute("aria-description", "이전 지원 14건 확인")
  await expect(ui.locator(".job-search-card details")).toHaveCount(0)
  await badge.focus(); await ui.keyboard.press("Enter")
  const dialog = ui.getByRole("dialog", { name: "이전 지원 내역", exact: true })
  await expect(dialog.getByRole("heading", { level: 2, name: "이전 지원 내역", exact: true })).toBeFocused()
  await expect(dialog.getByText("지원 완료 14건")).toBeVisible()
  await expect(dialog.locator(".search-history-entry h3")).toHaveText([...Array.from({ length: 13 }, (_, index) => `이전 직무 ${13 - index}`), "이전 직무 14"])
  await expect(dialog.locator(".search-history-entry").last()).toContainText("지원일 미확인")
  await expect(dialog.getByRole("link", { name: "지원 공고 보기", exact: true })).toHaveCount(11)
  await expect(dialog.locator(".search-history-entry").nth(2).getByRole("link")).toHaveAttribute("href", "https://www.jobkorea.co.kr/Recruit/GI_Read/810")
  mkdirSync(".tmp/search-history", { recursive: true })
  for (const theme of ["dark", "light"]) {
    await ui.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
    await ui.evaluate(() => document.getAnimations().forEach(animation => animation.finish()))
    await ui.screenshot({ path: `.tmp/search-history/dialog-${theme}.png` })
  }
  await ui.setViewportSize({ width: 390, height: 600 })
  const bounds = (await dialog.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
  expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(600)
  const list = dialog.getByRole("list", { name: "이전 지원 내역", exact: true })
  expect(await list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  await dialog.locator(".search-history-entry").last().scrollIntoViewIfNeeded()
  await expect(dialog.locator(".search-history-entry").last()).toBeVisible()
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeVisible()
  expect(await ui.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await ui.screenshot({ path: ".tmp/search-history/dialog-mobile.png" })
  await dialog.getByRole("button", { name: "지원 이력 닫기", exact: true }).click()
  await expect(dialog).toHaveCount(0); await expect(badge).toBeFocused()
  await badge.click()
  await ui.locator(".ui-dialog-overlay").click({ position: { x: 2, y: 2 } })
  await expect(dialog).toHaveCount(0); await expect(badge).toBeFocused()
  expect(await countRecords()).toBe(14)
})

test("검색 사이트의 사이트 체크를 실제 검색 대상에 반영한다", async () => {
  const requests: string[] = []
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    requests.push(new URL(route.request().url()).hostname)
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: jobkorea })
  })
  await ui.getByRole("button", { name: "검색 사이트", exact: true }).click()
  await expect(ui.getByRole("checkbox", { name: "사람인", exact: true })).toBeChecked()
  await expect(ui.getByRole("checkbox", { name: "잡코리아", exact: true })).toBeChecked()
  await ui.getByRole("checkbox", { name: "사람인", exact: true }).uncheck()
  await ui.getByRole("checkbox", { name: "원티드", exact: true }).uncheck()
  expect(requests).toHaveLength(0)
  await ui.getByRole("dialog", { name: "필터 선택", exact: true }).getByRole("button", { name: "적용", exact: true }).click()
  await ui.getByRole("searchbox", { name: "채용공고 검색어" }).fill("개발")
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(1)
  expect(requests).toEqual(["www.jobkorea.co.kr"])
  await expect(resultFilter("사람인")).toHaveCount(0)
})

test("모든 공고가 지원 기업으로 제외되어도 자동 요청을 반복하지 않는다", async () => {
  const saved = record({ companyName: "예시기업" })
  await ui.evaluate(async record => chrome.runtime.sendMessage({ type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [record] } }), saved)
  let requests = 0
  await context.route("https://www.saramin.co.kr/**", async route => {
    requests++
    const page = Number(new URL(route.request().url()).searchParams.get("recruitPage") || 1)
    const body = saramin(Array.from({ length: 20 }, (_, index) => page * 1000 + index), "사람인", page + 1).replace(/예시기업 \d+/g, "예시기업")
    await route.fulfill({ contentType: "text/html; charset=utf-8", body })
  })
  await ui.getByRole("button", { name: "검색 사이트", exact: true }).click()
  await ui.getByRole("checkbox", { name: "잡코리아", exact: true }).uncheck()
  await ui.getByRole("checkbox", { name: "원티드", exact: true }).uncheck()
  await ui.getByRole("dialog", { name: "필터 선택", exact: true }).getByRole("button", { name: "적용", exact: true }).click()
  await ui.getByRole("checkbox", { name: "지원 기업 제외하기" }).check()
  await ui.getByRole("searchbox", { name: "채용공고 검색어" }).fill("개발")
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  await expect(ui.getByText("지원 이력이 없는 기업의 공고가 없어요")).toBeVisible()
  await expect(ui.locator(".job-search-demo")).toHaveAttribute("aria-busy", "false")
  await ui.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(requests).toBe(1)
  await ui.getByRole("button", { name: "다음 공고 가져오기", exact: true }).click()
  await expect(ui.locator(".job-search-demo")).toHaveAttribute("aria-busy", "false")
  await ui.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(requests).toBe(2)
  await ui.getByRole("checkbox", { name: "지원 기업 제외하기" }).uncheck()
  await expect(ui.locator(".job-search-card")).toHaveCount(40)
  expect(requests).toBe(2)
})

test("패널에서 고르는 동안 요청하지 않고 적용·칩 해제 때만 결과를 갱신한다", async () => {
  const requests: URL[] = []
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    const url = new URL(route.request().url()); requests.push(url)
    const ids = Array.from({ length: 20 }, (_, index) => 1000 + index)
    const body = url.hostname.includes("saramin") ? saramin(ids) : url.hostname.includes("wanted") ? JSON.stringify(wanted)
      : `<main>${ids.map(id => jobkorea.replace(/<\/?main>/g, "").replace(/201/g, String(id))).join("")}</main>`
    await route.fulfill({ contentType: url.hostname.includes("wanted") ? "application/json" : "text/html; charset=utf-8", body })
  })
  await ui.getByRole("searchbox", { name: "채용공고 검색어" }).fill("React")
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(41)
  expect(requests).toHaveLength(3)
  await ui.getByRole("button", { name: "직군·직무", exact: true }).click()
  const panel = ui.getByRole("dialog", { name: "필터 선택", exact: true })
  await panel.getByRole("radio", { name: "IT개발·데이터", exact: true }).locator("..").click()
  await panel.getByRole("checkbox", { name: "프론트엔드", exact: true }).locator("..").click()
  expect(requests).toHaveLength(3)
  await panel.getByRole("button", { name: "취소", exact: true }).click()
  await expect(ui.locator(".search-selected-filters")).toHaveCount(0)
  expect(requests).toHaveLength(3)
  await ui.getByRole("button", { name: "직군·직무", exact: true }).click()
  await expect(panel.getByRole("radio", { name: "전체 직군", exact: true })).toBeChecked()
  await panel.getByRole("radio", { name: "IT개발·데이터", exact: true }).locator("..").click()
  await panel.getByRole("checkbox", { name: "프론트엔드", exact: true }).locator("..").click()
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(41)
  expect(requests).toHaveLength(7)
  expect(requests.slice(3).filter(url => !url.hostname.includes("wanted")).every(url => url.searchParams.get("cat_kewd") === "92" || url.searchParams.get("duty") === "1000230")).toBe(true)
  const wantedRequests = requests.slice(3).filter(url => url.hostname.includes("wanted"))
  expect(wantedRequests).toHaveLength(2)
  expect(wantedRequests.find(url => url.pathname.includes("navigation"))!.searchParams.getAll("job_ids")).toEqual(["669"])
  expect(wantedRequests.find(url => url.pathname.includes("search/v1"))!.searchParams.get("query")).toBe("React")
  await ui.getByRole("button", { name: "프론트엔드 조건 해제", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(41)
  expect(requests).toHaveLength(10)
  expect(requests.slice(7).every(url => !url.searchParams.has("cat_kewd") && !url.searchParams.has("duty") && !url.searchParams.has("job_ids"))).toBe(true)
})

test("모바일 통합 모달에서 지역을 검색하고 적용하거나 취소할 수 있다", async () => {
  await mockSmallSearch()
  await ui.setViewportSize({ width: 390, height: 844 })
  const trigger = ui.getByRole("button", { name: "지역", exact: true })
  await trigger.click()
  const panel = ui.getByRole("dialog", { name: "필터 선택", exact: true })
  await expect(panel).toHaveClass(/job-search-filter-modal/)
  const box = (await panel.boundingBox())!
  expect(box.x).toBe(0); expect(box.width).toBe(390); expect(box.y + box.height).toBeLessThanOrEqual(845)
  const input = panel.getByRole("searchbox", { name: "지역 검색", exact: true })
  await expect(input).not.toBeFocused()
  await input.fill("서울")
  await expect(panel.getByRole("checkbox")).toHaveCount(1)
  await panel.getByRole("checkbox", { name: "서울", exact: true }).locator("..").click()
  await panel.getByRole("button", { name: "취소", exact: true }).click()
  await expect(ui.getByRole("button", { name: "서울 조건 해제", exact: true })).toHaveCount(0)
  await trigger.click()
  await expect(panel.getByRole("checkbox", { name: "전국", exact: true })).toBeChecked()
  await input.fill("제주")
  await panel.getByRole("checkbox", { name: "제주", exact: true }).locator("..").click()
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await expect(ui.getByRole("button", { name: "제주 조건 해제", exact: true })).toBeVisible()
  await expect(trigger).toBeFocused()
  expect(await ui.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  mkdirSync(".tmp/search-demo", { recursive: true })
  await trigger.click()
  await ui.evaluate(() => document.getAnimations().forEach(animation => animation.finish()))
  await ui.screenshot({ path: ".tmp/search-demo/region-sheet-mobile.png" })
})

test("모든 조건은 같은 모달에서 전환하며 한 번의 적용으로 함께 검색한다", async () => {
  const requests: URL[] = []
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    const url = new URL(route.request().url()); requests.push(url)
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: url.hostname.includes("saramin") ? saramin() : jobkorea })
  })
  const panel = ui.getByRole("dialog", { name: "필터 선택", exact: true })
  for (const [trigger, tab] of [["직군·직무", "직무"], ["지역", "지역"], ["경력", "경력"], ["검색 사이트", "검색 사이트"]] as const) {
    await ui.getByRole("button", { name: trigger, exact: true }).click()
    await expect(ui.getByRole("dialog")).toHaveCount(1)
    await expect(panel.getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true")
    await panel.getByRole("button", { name: "필터 닫기", exact: true }).click()
  }
  await ui.getByRole("button", { name: "직군·직무", exact: true }).click()
  await panel.getByRole("radio", { name: "IT개발·데이터", exact: true }).locator("..").click()
  await panel.getByRole("checkbox", { name: "프론트엔드", exact: true }).locator("..").click()
  await panel.getByRole("tab", { name: "지역", exact: true }).click()
  await panel.getByRole("checkbox", { name: "서울", exact: true }).locator("..").click()
  await panel.getByRole("tab", { name: "경력", exact: true }).click()
  await panel.getByRole("checkbox", { name: "신입 포함", exact: true }).locator("..").click()
  await panel.getByRole("tab", { name: "검색 사이트", exact: true }).click()
  await panel.getByRole("checkbox", { name: "원티드", exact: true }).uncheck()
  await panel.getByRole("tab", { name: "직무", exact: true }).click()
  await expect(panel.getByRole("checkbox", { name: "프론트엔드", exact: true })).toBeChecked()
  await expect(ui.locator(".search-selected-filters")).toHaveCount(0)
  expect(requests).toHaveLength(0)
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(3)
  expect(requests).toHaveLength(2)
  expect(Object.fromEntries(requests.find(url => url.hostname.includes("saramin"))!.searchParams)).toMatchObject({ cat_kewd: "92", loc_mcd: "101000", exp_cd: "1" })
  expect(Object.fromEntries(requests.find(url => url.hostname.includes("jobkorea"))!.searchParams)).toMatchObject({ duty: "1000230", local: "I000", careerType: "1" })
  for (const label of ["프론트엔드", "서울", "신입"]) await expect(ui.getByRole("button", { name: `${label} 조건 해제`, exact: true })).toBeVisible()

  await ui.getByRole("button", { name: "경력", exact: true }).click()
  const tab = panel.getByRole("tab", { name: "경력", exact: true })
  await tab.focus(); await ui.keyboard.press("ArrowUp")
  await expect(panel.getByRole("tab", { name: "지역", exact: true })).toBeFocused()
  await panel.getByRole("button", { name: "초기화", exact: true }).click()
  await expect(panel.getByRole("checkbox", { name: "전국", exact: true })).toBeChecked()
  await panel.getByRole("tab", { name: "검색 사이트", exact: true }).click()
  for (const label of ["사람인", "잡코리아", "원티드", "리멤버"]) await panel.getByRole("checkbox", { name: label, exact: true }).uncheck()
  await expect(panel.getByRole("button", { name: "적용", exact: true })).toBeDisabled()
  await ui.keyboard.press("Escape")
  await expect(ui.getByRole("button", { name: "서울 조건 해제", exact: true })).toBeVisible()
  expect(requests).toHaveLength(2)
})

test("대시보드와 모든 관리 화면이 같은 콘텐츠 폭과 좌우 기준선을 쓴다", async () => {
  const navigation = ui.getByRole("navigation", { name: "주 메뉴", exact: true })
  for (const width of [1920, 2560, 390]) {
    await ui.setViewportSize({ width, height: 1000 })
    await navigation.getByRole("button", { name: "대시보드", exact: true }).click()
    const reference = (await ui.locator(".dashboard-overview-top").boundingBox())!
    if (width >= 1920) expect(reference.width).toBe(1360)
    for (const [label, selector] of [["공고 통합검색", ".job-search-demo"], ["지원 기록", ".workspace > section.card:not(.records-imports)"], ["취업 캘린더", ".career-calendar"], ["메모", ".notes-page"], ["설정", ".settings-stack"]] as const) {
      await navigation.getByRole("button", { name: new RegExp(`^${label}`) }).click()
      await expect(ui.locator(selector)).toBeVisible()
      const bounds = (await ui.locator(selector).boundingBox())!
      expect(Math.abs(bounds.x - reference.x), `${label} left at ${width}`).toBeLessThanOrEqual(1)
      expect(Math.abs(bounds.width - reference.width), `${label} width at ${width}`).toBeLessThanOrEqual(1)
      expect(await ui.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
  }
})

test("필터 버튼은 라이트·다크 모두 기본 배경과 hover 상태가 구분된다", async () => {
  const trigger = ui.getByRole("button", { name: "직군·직무", exact: true })
  for (const theme of ["dark", "light"]) {
    await ui.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
    await ui.mouse.move(0, 0)
    await ui.evaluate(() => document.getAnimations().forEach(animation => animation.finish()))
    const base = await trigger.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, expected: getComputedStyle(element).getPropertyValue("--surface-hover").trim() }))
    expect(base.background).not.toBe("rgba(0, 0, 0, 0)")
    expect(base.expected).toBe(theme === "dark" ? "#27272a" : "#f4f4f5")
    await trigger.hover()
    await ui.evaluate(() => document.getAnimations().forEach(animation => animation.finish()))
    expect(await trigger.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(base.background)
  }
})

test("복수 직무·직군·지역·경력의 선택·해제·전체 전환과 추가 조회 조건을 유지한다", async () => {
  await selectSaraminAndJobkorea()
  const requests: URL[] = []
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    const url = new URL(route.request().url()); requests.push(url)
    const page = Number(url.searchParams.get("recruitPage") || url.searchParams.get("Page_No") || 1)
    const ids = Array.from({ length: 20 }, (_, index) => page * 1000 + index)
    const body = url.hostname.includes("saramin") ? saramin(ids, "사람인", page === 1 ? 2 : 0)
      : `<main>${ids.map(id => jobkorea.replace(/<\/?main>/g, "").replace(/201/g, String(id))).join("")}${page === 1 ? '<a href="?Page_No=2">2</a>' : ""}</main>`
    await route.fulfill({ contentType: "text/html; charset=utf-8", body })
  })
  const panel = ui.getByRole("dialog", { name: "필터 선택", exact: true })
  const option = (label: string) => panel.getByRole("checkbox", { name: label, exact: true })
  const pick = async (label: string) => { await option(label).locator("..").click() }
  await ui.getByRole("button", { name: "직군·직무", exact: true }).click()
  await panel.getByRole("radio", { name: "IT개발·데이터", exact: true }).locator("..").click()
  await pick("프론트엔드"); await pick("백엔드·서버")
  await option("백엔드·서버").focus(); await ui.keyboard.press("Space")
  await expect(option("백엔드·서버")).not.toBeChecked()
  await ui.keyboard.press("Space")
  await expect(option("프론트엔드")).toBeChecked(); await expect(option("백엔드·서버")).toBeChecked()
  await panel.getByRole("radio", { name: "디자인", exact: true }).locator("..").click()
  await pick("디자인 전체")
  await panel.getByRole("radio", { name: "IT개발·데이터", exact: true }).locator("..").click()
  await expect(option("프론트엔드")).toBeChecked()
  await expect(panel.getByRole("radio", { name: "IT개발·데이터", exact: true })).toHaveAttribute("aria-description", "2개 선택")
  mkdirSync(".tmp/filter-ux", { recursive: true })
  for (const theme of ["dark", "light"]) {
    await ui.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
    await ui.mouse.move(0, 0)
    await ui.evaluate(() => document.getAnimations().forEach(animation => animation.finish()))
    const visual = await option("프론트엔드").locator("..").evaluate(element => {
      const selected = getComputedStyle(element), other = getComputedStyle(element.parentElement!.querySelector(".filter-modal-chip:not(.selected)")!)
      const ctx = document.createElement("canvas").getContext("2d")!
      const pixel = (color: string) => { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) }
      return { selected: pixel(selected.backgroundColor), other: pixel(other.backgroundColor), color: selected.color, expected: getComputedStyle(element.closest('[role="dialog"]')!).color, check: !!element.querySelector(".filter-option-check svg") }
    })
    expect(Math.abs(visual.selected[0]! - visual.other[0]!)).toBeGreaterThan(30)
    expect(Math.max(...visual.selected) - Math.min(...visual.selected)).toBeLessThan(10)
    expect(visual.color).toBe(visual.expected); expect(visual.check).toBe(true)
    await ui.screenshot({ path: `.tmp/filter-ux/multi-${theme}.png` })
  }
  await panel.getByRole("tab", { name: "지역", exact: true }).click()
  await pick("서울"); await pick("경기")
  await expect(option("서울")).toBeChecked(); await expect(option("경기")).toBeChecked()
  await pick("전국")
  await expect(option("서울")).not.toBeChecked(); await expect(option("경기")).not.toBeChecked()
  await pick("서울"); await pick("경기")
  await panel.getByRole("tab", { name: "경력", exact: true }).click()
  await pick("신입 포함"); await pick("경력 포함"); await pick("경력무관 포함")
  expect(requests).toHaveLength(0)
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(40)
  expect(requests).toHaveLength(2)
  function expectFilters(url: URL, frontend = true) {
    if (url.hostname.includes("saramin")) expect(Object.fromEntries(url.searchParams)).toMatchObject({ cat_mcls: "15", cat_kewd: frontend ? "92,84" : "84", loc_mcd: "101000,102000", exp_cd: "1,2", exp_none: "y" })
    else {
      expect(Object.fromEntries(url.searchParams)).toMatchObject({ local: "I000,B000", careerType: "1,2,4" })
      const duty = url.searchParams.get("duty")!.split(",")
      expect(duty).toContain("1000229"); expect(duty.includes("1000230")).toBe(frontend)
    }
  }
  requests.forEach(url => expectFilters(url))
  for (const label of ["프론트엔드", "백엔드·서버", "디자인", "서울", "경기", "신입", "경력", "경력무관"]) await expect(ui.getByRole("button", { name: `${label} 조건 해제`, exact: true })).toBeVisible()
  await ui.getByRole("button", { name: "직군·직무", exact: true }).click()
  await pick("IT개발·데이터 전체")
  await expect(option("프론트엔드")).not.toBeChecked(); await expect(option("백엔드·서버")).not.toBeChecked()
  await panel.getByRole("radio", { name: "디자인", exact: true }).locator("..").click()
  await expect(option("디자인 전체")).toBeChecked()
  await ui.keyboard.press("Escape")
  expect(requests).toHaveLength(2)
  await ui.locator(".job-search-scroll-end").scrollIntoViewIfNeeded()
  await expect(ui.locator(".job-search-card")).toHaveCount(80)
  expect(requests).toHaveLength(4); requests.slice(2).forEach(url => expectFilters(url))
  await ui.getByRole("button", { name: "프론트엔드 조건 해제", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(40)
  expect(requests).toHaveLength(6); requests.slice(4).forEach(url => expectFilters(url, false))
})

test("신입~3년과 2~5년을 검색하고 범위 검증·취소·다음 조회·칩 해제를 연결한다", async () => {
  await selectSaraminAndJobkorea()
  const requests: URL[] = []
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    const url = new URL(route.request().url()); requests.push(url)
    const page = Number(url.searchParams.get("recruitPage") || url.searchParams.get("Page_No") || 1)
    const ids = Array.from({ length: 20 }, (_, index) => page * 1000 + index)
    const body = url.hostname.includes("saramin") ? saramin(ids, "사람인", page === 1 ? 2 : 0)
      : `<main>${ids.map(id => jobkorea.replace(/<\/?main>/g, "").replace(/201/g, String(id))).join("")}${page === 1 ? '<a href="?Page_No=2">2</a>' : ""}</main>`
    await route.fulfill({ contentType: "text/html; charset=utf-8", body })
  })
  const trigger = ui.getByRole("button", { name: "경력", exact: true })
  const panel = ui.getByRole("dialog", { name: "필터 선택", exact: true })
  const min = panel.getByRole("combobox", { name: "최소 경력", exact: true })
  const max = panel.getByRole("combobox", { name: "최대 경력", exact: true })
  await trigger.click()
  await panel.getByRole("button", { name: "신입~3년", exact: true }).click()
  await expect(min).toHaveValue("0"); await expect(max).toHaveValue("3")
  await expect(panel.getByRole("checkbox", { name: "신입 포함", exact: true })).toBeChecked()
  await expect(panel.getByRole("checkbox", { name: "경력 포함", exact: true })).toBeChecked()
  await expect(panel.getByRole("checkbox", { name: "경력무관 포함", exact: true })).not.toBeChecked()
  await expect(panel.getByRole("status")).toContainText("신입 · 경력 3년 이하")
  expect(requests).toHaveLength(0)
  mkdirSync(".tmp/career-range", { recursive: true })
  for (const theme of ["dark", "light"]) {
    await ui.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
    await ui.evaluate(() => document.getAnimations().forEach(animation => animation.finish()))
    await ui.screenshot({ path: `.tmp/career-range/${theme}.png` })
  }
  await ui.setViewportSize({ width: 390, height: 720 })
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(panel.getByRole("button", { name: "적용", exact: true })).toBeVisible()
  await ui.screenshot({ path: ".tmp/career-range/mobile.png" })
  await ui.setViewportSize({ width: 1440, height: 1000 })
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(40)
  expect(requests).toHaveLength(2)
  await expect(ui.locator(".search-filter-active")).toHaveCount(0)
  function expectRange(url: URL, lower?: number, upper = 3, withNew = true) {
    const sar = url.hostname.includes("saramin")
    expect(url.searchParams.get(sar ? "exp_cd" : "careerType")).toBe(withNew ? "1,2" : "2")
    expect(url.searchParams.get(sar ? "exp_min" : "careerMin")).toBe(lower === undefined ? (sar ? null : "0") : String(lower))
    expect(url.searchParams.get(sar ? "exp_max" : "careerMax")).toBe(String(upper))
  }
  requests.forEach(url => expectRange(url))
  await ui.locator(".job-search-scroll-end").scrollIntoViewIfNeeded()
  await expect(ui.locator(".job-search-card")).toHaveCount(80)
  expect(requests).toHaveLength(4); requests.slice(2).forEach(url => expectRange(url))
  await trigger.click()
  await panel.getByRole("button", { name: "2~5년", exact: true }).click()
  await min.selectOption("5")
  await expect(panel.getByRole("alert")).toContainText("최대 경력은 최소 경력보다 크게")
  await expect(panel.getByRole("button", { name: "적용", exact: true })).toBeDisabled()
  await max.selectOption("3")
  await expect(panel.getByRole("button", { name: "적용", exact: true })).toBeDisabled()
  expect(requests).toHaveLength(4)
  await max.selectOption("8")
  await expect(panel.getByRole("alert")).toHaveCount(0)
  await panel.getByRole("button", { name: "취소", exact: true }).click()
  await trigger.click()
  await expect(min).toHaveValue("0"); await expect(max).toHaveValue("3")
  await panel.getByRole("button", { name: "2~5년", exact: true }).click()
  await expect(min).toHaveValue("2"); await expect(max).toHaveValue("5")
  await expect(panel.getByRole("checkbox", { name: "신입 포함", exact: true })).not.toBeChecked()
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(40)
  expect(requests).toHaveLength(6); requests.slice(4).forEach(url => expectRange(url, 2, 5, false))
  await expect(trigger).toHaveAttribute("aria-description", "경력 2~5년")
  await ui.getByRole("button", { name: "경력 2~5년 조건 해제", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(0)
  await expect(trigger).toHaveAttribute("aria-description", "경력 전체")
  expect(requests).toHaveLength(6)
})

test("직접 연차 선택은 경력을 자동 포함하고 해제·전체·초기화는 연차 값을 지운다", async () => {
  await mockSmallSearch()
  await ui.getByRole("button", { name: "경력", exact: true }).click()
  const panel = ui.getByRole("dialog", { name: "필터 선택", exact: true })
  const min = panel.getByRole("combobox", { name: "최소 경력", exact: true }), max = panel.getByRole("combobox", { name: "최대 경력", exact: true })
  await max.selectOption("3")
  const experienced = panel.getByRole("checkbox", { name: "경력 포함", exact: true })
  await expect(experienced).toBeChecked()
  await expect(panel.getByRole("checkbox", { name: "신입 포함", exact: true })).toBeChecked()
  await experienced.locator("..").click()
  await expect(min).toHaveValue("0"); await expect(max).toHaveValue("")
  await panel.getByRole("button", { name: "5년 이상", exact: true }).click()
  await expect(min).toHaveValue("5"); await expect(max).toHaveValue("")
  await min.selectOption("0")
  await expect(panel.getByRole("checkbox", { name: "신입 포함", exact: true })).toBeChecked()
  await panel.getByRole("checkbox", { name: "신입 포함", exact: true }).locator("..").click()
  await expect(min).toHaveValue("")
  await min.selectOption("0")
  await expect(panel.getByRole("checkbox", { name: "신입 포함", exact: true })).toBeChecked()
  await panel.getByRole("button", { name: "전체", exact: true }).click()
  await expect(min).toHaveValue("0"); await expect(max).toHaveValue("")
  await panel.getByRole("button", { name: "신입~3년", exact: true }).click()
  await panel.getByRole("button", { name: "초기화", exact: true }).click()
  await expect(min).toHaveValue("0"); await expect(max).toHaveValue("")
  await expect(experienced).not.toBeChecked()
  await panel.getByRole("checkbox", { name: "경력무관 포함", exact: true }).locator("..").click()
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await expect(ui.getByRole("button", { name: "경력무관 조건 해제", exact: true })).toBeVisible()
})

test("마지막 적용 조건 1건을 페이지 재진입·새로고침·새 탭에서 복원하고 자동 조회하지 않는다", async () => {
  let requests = 0
  await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
    requests++
    const host = new URL(route.request().url()).hostname
    await route.fulfill({ contentType: host.includes("wanted") ? "application/json" : "text/html; charset=utf-8", body: host.includes("saramin") ? saramin() : host.includes("jobkorea") ? jobkorea : JSON.stringify(wanted) })
  })
  const saved = () => ui.evaluate(key => JSON.parse(localStorage.getItem(key)!), jobSearchPreferencesKey)
  await ui.getByRole("searchbox", { name: "채용공고 검색어" }).fill("React")
  await ui.getByRole("button", { name: "직군·직무", exact: true }).click()
  const panel = ui.getByRole("dialog", { name: "필터 선택", exact: true })
  await panel.getByRole("radio", { name: "IT개발·데이터", exact: true }).locator("..").click()
  await panel.getByRole("checkbox", { name: "프론트엔드", exact: true }).locator("..").click()
  await panel.getByRole("tab", { name: "지역", exact: true }).click()
  await panel.getByRole("checkbox", { name: "서울", exact: true }).locator("..").click()
  await panel.getByRole("tab", { name: "경력", exact: true }).click()
  await panel.getByRole("button", { name: "신입~3년", exact: true }).click()
  await panel.getByRole("tab", { name: "검색 사이트", exact: true }).click()
  await panel.getByRole("checkbox", { name: "원티드", exact: true }).uncheck()
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(3)
  await ui.getByRole("checkbox", { name: "지원 기업 제외하기", exact: true }).check()
  const expected = { version: 1, query: "React", sites: ["saramin", "jobkorea"], filters: { group: [], role: ["frontend"], region: ["seoul"], career: ["new", "experienced"], careerMin: 0, careerMax: 3 }, excludeApplied: true }
  expect(await saved()).toEqual(expected)
  await ui.getByRole("searchbox", { name: "채용공고 검색어" }).fill("아직 검색하지 않은 입력")
  await ui.getByRole("button", { name: "지역", exact: true }).click()
  await panel.getByRole("checkbox", { name: "부산", exact: true }).locator("..").click()
  await panel.getByRole("button", { name: "취소", exact: true }).click()
  await ui.getByRole("checkbox", { name: "지원 기업 제외하기", exact: true }).uncheck()
  await ui.getByRole("checkbox", { name: "지원 기업 제외하기", exact: true }).check()
  expect(await saved()).toEqual(expected)
  const navigation = ui.getByRole("navigation", { name: "주 메뉴", exact: true })
  await navigation.getByRole("button", { name: "메모", exact: true }).click()
  await navigation.getByRole("button", { name: "공고 통합검색", exact: true }).click()
  await expect(ui.getByRole("searchbox", { name: "채용공고 검색어" })).toHaveValue("React")
  await expect(ui.getByRole("button", { name: "서울 조건 해제", exact: true })).toBeVisible()
  await expect(ui.getByRole("button", { name: "경력 3년 이하 조건 해제", exact: true })).toBeVisible()
  await expect(ui.getByRole("checkbox", { name: "지원 기업 제외하기", exact: true })).toBeChecked()
  await expect(ui.locator(".job-search-card")).toHaveCount(0)
  expect(requests).toBe(2)
  await ui.getByRole("button", { name: "검색 사이트", exact: true }).click()
  await expect(panel.getByRole("checkbox", { name: "원티드", exact: true })).not.toBeChecked()
  await panel.getByRole("button", { name: "취소", exact: true }).click()
  await ui.reload()
  await expect(ui.getByRole("searchbox", { name: "채용공고 검색어" })).toHaveValue("React")
  await expect(ui.locator(".job-search-card")).toHaveCount(0)
  expect(requests).toBe(2)
  const reopened = await context.newPage()
  await reopened.goto(ui.url())
  await expect(reopened.getByRole("searchbox", { name: "채용공고 검색어" })).toHaveValue("React")
  await expect(reopened.getByRole("button", { name: "프론트엔드 조건 해제", exact: true })).toBeVisible()
  await expect(reopened.locator(".job-search-card")).toHaveCount(0)
  expect(requests).toBe(2)
  await reopened.close()
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(3)
  expect(requests).toBe(4)
  expect(await saved()).toEqual(expected)
  expect(await ui.evaluate(key => Object.keys(localStorage).filter(name => name === key).length, jobSearchPreferencesKey)).toBe(1)
  expect(JSON.stringify(await saved())).not.toMatch(/사람인 공고|잡코리아 공고|예시기업|jobs|records|response/)
  expect(await countRecords()).toBe(0)
})

test("두 번째 조건은 한 건을 교체하고 초기화·사이트만 선택한 값도 다음 열기에 유지한다", async () => {
  await mockSmallSearch()
  const navigation = ui.getByRole("navigation", { name: "주 메뉴", exact: true })
  await chooseFilter("근무 지역", "seoul")
  await ui.getByRole("button", { name: "지역", exact: true }).click()
  const panel = ui.getByRole("dialog", { name: "필터 선택", exact: true })
  await panel.getByRole("checkbox", { name: "전국", exact: true }).locator("..").click()
  await panel.getByRole("checkbox", { name: "부산", exact: true }).locator("..").click()
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await expect(ui.locator(".job-search-demo")).toHaveAttribute("aria-busy", "false")
  await navigation.getByRole("button", { name: "메모", exact: true }).click()
  await navigation.getByRole("button", { name: "공고 통합검색", exact: true }).click()
  await expect(ui.getByRole("button", { name: "부산 조건 해제", exact: true })).toBeVisible()
  await expect(ui.getByRole("button", { name: "서울 조건 해제", exact: true })).toHaveCount(0)
  await ui.getByRole("button", { name: "전체 초기화", exact: true }).click()
  await ui.getByRole("button", { name: "검색 사이트", exact: true }).click()
  await panel.getByRole("checkbox", { name: "사람인", exact: true }).uncheck()
  await panel.getByRole("checkbox", { name: "원티드", exact: true }).uncheck()
  await panel.getByRole("button", { name: "적용", exact: true }).click()
  await ui.reload()
  await expect(ui.locator(".search-selected-filters")).toHaveCount(0)
  await expect(ui.getByRole("searchbox", { name: "채용공고 검색어" })).toHaveValue("")
  await ui.getByRole("button", { name: "검색 사이트", exact: true }).click()
  await expect(panel.getByRole("checkbox", { name: "잡코리아", exact: true })).toBeChecked()
  await expect(panel.getByRole("checkbox", { name: "사람인", exact: true })).not.toBeChecked()
  await expect(panel.getByRole("checkbox", { name: "원티드", exact: true })).not.toBeChecked()
})

test("깨진 저장 조건은 기본 화면으로 복구하며 저장소가 막혀도 검색할 수 있다", async () => {
  await mockSmallSearch()
  await ui.evaluate(key => localStorage.setItem(key, '{"version":999,"query":"잘못된 값"}'), jobSearchPreferencesKey)
  await ui.reload()
  await expect(ui.getByRole("searchbox", { name: "채용공고 검색어" })).toHaveValue("")
  await expect(ui.locator(".search-selected-filters")).toHaveCount(0)
  await ui.addInitScript(key => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new Error("storage disabled"); return original.call(this, name, value) }
  }, jobSearchPreferencesKey)
  await ui.reload()
  await ui.getByRole("searchbox", { name: "채용공고 검색어" }).fill("React")
  await ui.getByRole("button", { name: "통합검색", exact: true }).click()
  await expect(ui.locator(".job-search-card")).toHaveCount(4)
})

test("직군 목록 하단을 선택해도 스크롤 위치를 유지하고 키보드로 이어 탐색한다", async () => {
  for (const width of [1440, 390]) {
    await ui.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    for (const theme of ["light", "dark"]) {
      await ui.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
      await ui.getByRole("button", { name: "직군·직무", exact: true }).click()
      const panel = ui.getByRole("dialog", { name: "필터 선택", exact: true })
      const groups = panel.locator(".filter-modal-groups")
      for (let index = 8; index < jobGroups.length; index++) {
        const option = groups.getByRole("radio").nth(index)
        await option.locator("..").scrollIntoViewIfNeeded()
        const top = await groups.evaluate(element => element.scrollTop)
        await option.locator("..").click()
        await expect(option).toBeChecked()
        expect(await groups.evaluate(element => element.scrollTop), `width=${width}, theme=${theme}, group=${index}`).toBeCloseTo(top, 0)
        expect(await panel.evaluate(element => element.scrollTop), `modal width=${width}, theme=${theme}, group=${index}`).toBe(0)
      }
      const last = groups.getByRole("radio").last(), previous = groups.getByRole("radio").nth(jobGroups.length - 2)
      await last.locator("..").scrollIntoViewIfNeeded()
      const before = await groups.evaluate(element => element.scrollTop)
      expect(before).toBeGreaterThan(100)
      await last.locator("..").click()
      await expect(last).toBeChecked()
      await expect.poll(() => groups.evaluate(element => element.scrollTop)).toBeCloseTo(before, 0)
      await previous.locator("..").click()
      await expect(previous).toBeChecked()
      expect(Math.abs(await groups.evaluate(element => element.scrollTop) - before)).toBeLessThanOrEqual(1)
      await previous.press("ArrowDown")
      await expect(last).toBeChecked()
      expect(Math.abs(await groups.evaluate(element => element.scrollTop) - before)).toBeLessThanOrEqual(1)
      expect(await panel.locator(".filter-modal-content").evaluate(element => element.scrollTop)).toBe(0)
      await expect(panel.getByRole("button", { name: "적용", exact: true })).toBeInViewport()
      await panel.getByRole("button", { name: "취소", exact: true }).click()
    }
  }
})
