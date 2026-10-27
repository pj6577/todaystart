import { test as base, expect, chromium, type BrowserContext, type Page } from "@playwright/test"
import path from "node:path"
import { fixture, fixtureProfile, record } from "../helpers"
import type { Snapshot } from "../../src/ui/client"
import type { Envelope, Request } from "../../src/messaging/protocol"
import publicMetadata from "../fixtures/public/metadata.json"
import searchPage5 from "../fixtures/public/jobkoreaSearchPage5.json"
import { inspectedHistory } from "../fixtures/inspected-history"
import { publicPostingPages } from "../../src/platforms/public-postings"
import { wantedInspectedHistory, wantedInspectedResponse } from "../fixtures/wanted-inspected-history"
import type { PageState } from "../../src/core/model"
import { saraminSubmissionPage, saraminSubmissionDetail, jobkoreaSubmissionDetail, jobkoreaSubmissionPage } from "../fixtures/submission-flow"

const test = base.extend<{ context: BrowserContext; ui: Page; extensionId: string }>({
  context: async ({}, use) => {
    const extension = path.resolve("build/chrome-mv3-prod")
    const context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, viewport: { width: 1440, height: 1000 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] })
    await context.route(/^https:\/\/www\.(saramin|jobkorea|wanted)\.co\.kr\//, async route => {
      const url = new URL(route.request().url())
      const platform = url.hostname.includes("saramin") ? "saramin" : "jobkorea"
      const filename = url.pathname.includes("history") ? `${platform}-history.html` : `${platform}-jobs.html`
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture(filename) })
    })
    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker")
    await use(new URL(worker.url()).host)
  },
  ui: async ({ context, extensionId }, use) => {
    const page = await context.newPage()
    page.on("pageerror", error => console.error("Extension UI error:", error.message))
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await expect(page.getByRole("heading", { name: "여러 곳에 남긴 지원 기록을 한곳에서 확인해요", exact: true })).toBeVisible()
    await use(page)
  }
})

test("사람인 직무별 목록: 일반·추천 카드 이력과 기본 동작·동적 교체", async ({ ui, context }) => {
  const url = "https://www.saramin.co.kr/zf_user/jobs/list/job-category?cat_kewd=84"
  const records = [
    record({ platform: "saramin", companyName: "(주)넛지헬스케어", sourceApplicationId: "category-nudge", jobTitle: "이전 넛지 지원 직무" }),
    record({ platform: "jobkorea", companyName: "빅링크에이아이", sourceApplicationId: "category-biglink", jobTitle: "이전 빅링크 지원 직무" }),
    record({ platform: "wanted", companyName: "티피씨", sourceApplicationId: "category-tpc" }),
    record({ platform: "remember", companyName: "넛지홀딩스그룹", sourceApplicationId: "category-group" })
  ]
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records } })
  await context.route("https://www.saramin.co.kr/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("saramin-category-postings.html") }))
  const jobs = await context.newPage(); await jobs.goto(url)
  const warnings = jobs.locator("todaystart-warning")
  await expect(warnings).toHaveCount(4)
  await expect(jobs.locator("#rec-55378653 > todaystart-warning")).toContainText("사람인 지원 이력 있음")
  await expect(jobs.locator("#rec-55277162 > todaystart-warning")).toContainText("잡코리아 지원 이력 있음")
  await expect(jobs.locator(".swiper-slide").last().locator("todaystart-warning")).toContainText("원티드 지원 이력 있음")
  await expect(jobs.locator("#rec-55378329 todaystart-warning, #rec-55345644 todaystart-warning")).toHaveCount(0)
  expect(await warnings.evaluateAll(elements => elements.every(element => element.parentElement?.firstElementChild === element && !element.closest("a")))).toBe(true)
  const card = jobs.locator("#rec-55378653")
  await card.evaluate(element => element.addEventListener("click", () => { document.body.dataset.cardClicked = "true" }))
  await card.locator("todaystart-warning summary").click()
  await expect(card.locator("todaystart-warning")).toContainText("이전 넛지 지원 직무")
  expect(await jobs.locator("body").getAttribute("data-card-clicked")).toBeNull()
  await jobs.locator(".newcomer_book_mark").first().evaluate(element => element.addEventListener("click", () => { document.body.dataset.bookmarked = "true" }))
  await jobs.locator(".newcomer_book_mark").first().click()
  await expect(jobs.locator("body")).toHaveAttribute("data-bookmarked", "true")
  await card.locator("button.btn_scrap").evaluate(element => element.addEventListener("click", () => { document.body.dataset.scrapped = "true" }))
  await card.locator("button.btn_scrap").click()
  await expect(jobs.locator("body")).toHaveAttribute("data-scrapped", "true")
  const opened = context.waitForEvent("page")
  await card.locator(".support_info a").click()
  const detail = await opened
  await expect(detail).toHaveURL(/rec_idx=55378653/)
  await detail.close()
  await jobs.locator(".list_body").evaluate(root => {
    const replacement = root.cloneNode(true) as Element
    const next = replacement.querySelector("#rec-55277162")!.cloneNode(true) as Element
    next.id = "rec-55277163"
    next.querySelector(".job_tit a")!.setAttribute("href", "/zf_user/jobs/relay/view?rec_idx=55277163")
    replacement.append(next)
    root.replaceWith(replacement)
  })
  await expect(warnings).toHaveCount(5)
  await expect.poll(() => warnings.evaluateAll(elements => elements.every(element => !!element.shadowRoot))).toBe(true)
  await jobs.locator("#rec-55277162 .company_nm > .str_tit").evaluate(element => { element.textContent = "처음 보는 회사" })
  await expect(warnings).toHaveCount(4)
  await expect(jobs.locator("#rec-55277162 todaystart-warning")).toHaveCount(0)
  expect(await count(ui)).toBe(4)
})

test("리멤버 공고 목록: 가져온 리멤버 이력을 카드 상단에 표시하고 기본 동작 유지", async ({ ui, context }) => {
  const historyUrl = "https://profile.rememberapp.co.kr/applies", listingUrl = "https://career.rememberapp.co.kr/job/postings"
  await context.route("https://profile.rememberapp.co.kr/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("remember-history.html").replaceAll("(주)포페런츠", "(주)휴멜로") }))
  const history = await context.newPage(); await history.goto(historyUrl)
  await sync(ui, history)
  await context.route("https://career.rememberapp.co.kr/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: new URL(route.request().url()).pathname === "/job/postings" ? fixture("remember-postings.html") + '<style>body{margin:40px;font-family:sans-serif;background:#fafafa}.bvLurj{width:560px;background:white;border:1px solid #ddd;border-radius:12px;overflow:hidden}.jzTeOc{display:block;padding:24px;color:#222;text-decoration:none}h4{font-size:20px}p{font-size:15px}</style>' : "<h1>가상 공고 상세</h1>" }))
  const jobs = await context.newPage(); await jobs.goto(listingUrl)
  const warning = jobs.locator("todaystart-warning")
  await expect(warning).toHaveCount(1)
  await expect(warning).toContainText("리멤버 지원 이력 있음")
  const placement = await warning.evaluate(element => ({ first: element.parentElement?.firstElementChild === element, insideLink: !!element.closest("a"), linkNext: element.nextElementSibling?.tagName === "A" }))
  expect(placement).toEqual({ first: true, insideLink: false, linkNext: true })
  await warning.evaluate(element => element.parentElement!.addEventListener("click", () => { document.body.dataset.cardClicked = "true" }))
  const pages = context.pages().length
  await warning.locator("summary").click()
  await expect(warning).toContainText("Product Engineer")
  await expect(jobs).toHaveURL(listingUrl)
  expect(context.pages()).toHaveLength(pages)
  expect(await jobs.locator("body").getAttribute("data-card-clicked")).toBeNull()
  await jobs.locator("a button").evaluate(button => button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); document.body.dataset.bookmarked = "true" }))
  await jobs.locator("a button").click()
  await expect(jobs.locator("body")).toHaveAttribute("data-bookmarked", "true")
  expect(context.pages()).toHaveLength(pages)
  await jobs.screenshot({ path: "docs/screenshots/remember-listing-warning.png", fullPage: true })
  const opened = context.waitForEvent("page")
  await jobs.locator("a h4").click()
  const detail = await opened
  await expect(detail).toHaveURL(/career\.rememberapp\.co\.kr\/job\/posting\/338684\?/)
  expect(await count(ui)).toBe(5)
  expect(JSON.stringify(await rpc(ui, { type: "backup" }))).not.toMatch(/PRIVATE_SESSION|jdViewSource|Tikita/)
})

test("리멤버 공고 목록: 다른 경로·동적 카드·복제·기업 변경·설정·SPA", async ({ ui, context }) => {
  const listingUrl = "https://career.rememberapp.co.kr/job/postings"
  const records = (["saramin", "jobkorea", "wanted", "manual"] as const).map(platform => record({ platform, sourceApplicationId: `remember-list-${platform}`, companyName: "휴멜로", normalizedCompanyName: "휴멜로", jobTitle: `${platform}에서 지원한 다른 직무` }))
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records } })
  await context.route("https://career.rememberapp.co.kr/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("remember-postings.html") }))
  const jobs = await context.newPage(); await jobs.goto("https://career.rememberapp.co.kr/")
  await expect(jobs.locator("todaystart-warning")).toHaveCount(0)
  await jobs.evaluate(() => history.pushState({}, "", "/job/postings/?keyword=react"))
  const warnings = jobs.locator("todaystart-warning")
  await expect(warnings).toHaveCount(1)
  for (const label of ["사람인", "잡코리아", "원티드", "직접 지원"]) await expect(warnings).toContainText(label)
  await jobs.locator('a[href*="/job/posting/"]').evaluate(link => {
    const clone = link.parentElement!.cloneNode(true) as HTMLElement
    clone.querySelector("a")!.setAttribute("href", "/job/posting/338685?channel=inweb_list")
    clone.style.marginTop = "1200px"
    document.body.append(clone)
  })
  await jobs.locator('a[href*="338685"]').scrollIntoViewIfNeeded()
  await expect(warnings).toHaveCount(2)
  await expect.poll(() => warnings.evaluateAll(elements => elements.every(element => !!element.shadowRoot))).toBe(true)
  await jobs.locator('a[href*="338684"] p').evaluate(element => { element.textContent = "다른 기업" })
  await expect(warnings).toHaveCount(1)
  expect(await warnings.evaluate(element => element.parentElement?.querySelector("a")?.getAttribute("href"))).toContain("338685")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, listingWarnings: false } })
  await expect(warnings).toHaveCount(0)
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, listingWarnings: true, theme: "dark" } })
  await expect(warnings).toHaveCount(1)
  await expect(warnings).toHaveAttribute("data-theme", "dark")
  await jobs.goto("https://career.rememberapp.co.kr/applies")
  await expect(warnings).toHaveCount(0)
  expect(await count(ui)).toBe(4)
})

test("리멤버 지원 목록: 수동 가져오기·중복 병합·통계·다른 사이트 이력 안내", async ({ ui, context }) => {
  const url = "https://profile.rememberapp.co.kr/applies"
  await context.route("https://profile.rememberapp.co.kr/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("remember-history.html") }))
  const history = await context.newPage(); await history.goto(url)
  await expect.poll(async () => { try { return (await pageMessage<import("../../src/core/model").PageState>(ui, url, "GET_PAGE")).ok } catch { return false } }).toBe(true)
  expect(await count(ui)).toBe(0) // Separate history auto-collection remains off.
  await sync(ui, history); await sync(ui, history)
  let snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.records).toHaveLength(5)
  expect(snapshot.records.every(record => record.platform === "remember" && record.evidence === "history_page")).toBe(true)
  expect(snapshot.records.filter(record => record.readStatus === "read")).toHaveLength(3)
  expect(await history.locator("body").getAttribute("data-details-clicked")).toBeNull()
  expect(JSON.stringify(await rpc(ui, { type: "backup" }))).not.toMatch(/PRIVATE_|추천 기업/)
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await ui.locator(".table-tabs").getByRole("button", { name: /리멤버/ }).click()
  await expect(ui.locator("tbody tr")).toHaveCount(5)
  await expect(ui.locator("tbody tr").first()).toContainText("포페런츠")
  await expect(ui.locator(".platform-tag.remember")).toHaveCount(5)
  await ui.screenshot({ path: "docs/screenshots/remember-records.png", fullPage: true })
  await ui.getByRole("button", { name: "대시보드", exact: true }).click()
  await ui.getByRole("button", { name: "리멤버 통계 보기", exact: true }).click()
  await expect(ui.locator(".summary-total .stat-number")).toContainText("5")
  await expect(ui.locator(".weekday-panel .analytics-heading")).toContainText("리멤버")
  await ui.screenshot({ path: "docs/screenshots/remember-dashboard.png", fullPage: true })
  for (const source of [publicMetadata.saraminDetail, publicMetadata.jobkoreaList]) {
    const html = fixture(`public/${source.id}.html`).replaceAll(source.expected[0]!.companyName, "(주)포페런츠")
    await context.route(source.sourceUrl, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: html }))
    const jobs = await context.newPage(); await jobs.goto(source.sourceUrl)
    await expect(jobs.locator("todaystart-warning").first()).toContainText("리멤버 지원 이력 있음")
    await expect(jobs.locator("todaystart-warning").first()).toContainText("Product Engineer")
    await jobs.close()
  }
  // Existing settings and stored records survive turning off this integration.
  snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, consent: { ...snapshot.settings.consent, remember: false } } })
  const denied = await pageMessage(ui, url, "SYNC_PAGE")
  expect(denied.ok).toBe(false)
  expect(await count(ui)).toBe(5)
})

test("리멤버 지원 목록: 마지막 페이지 근거가 없으면 현재 5건 저장 후 중지", async ({ ui, context }) => {
  const url = "https://profile.rememberapp.co.kr/applies"
  await context.route("https://profile.rememberapp.co.kr/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("remember-history.html") }))
  const history = await context.newPage(); await history.goto(url)
  await sync(ui, history)
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), url)
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 15000 }).toBe("stopped")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.records).toHaveLength(5)
  expect(snapshot.historyRun).toMatchObject({ platform: "remember", pages: 1, processed: 5 })
  expect(snapshot.historyRun?.message).toContain("마지막 페이지 여부")
  expect(snapshot.historyCompletions?.remember).toBeUndefined()
})

test("리멤버 지원 목록: 실제 다음 링크가 있는 합성 화면은 끝까지 병합", async ({ ui, context }) => {
  const url = "https://profile.rememberapp.co.kr/applies"
  await context.route("https://profile.rememberapp.co.kr/**", route => {
    const page = Number(new URL(route.request().url()).searchParams.get("page") || 1)
    const navigation = page === 1 ? '<nav aria-label="페이지"><strong aria-current="page">1</strong><a href="?page=2">2</a></nav>' : '<nav aria-label="페이지"><a href="?page=1">1</a><strong aria-current="page">2</strong><button aria-label="다음 페이지" disabled>다음</button></nav>'
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("remember-history.html").replace("2026.10.14", page === 1 ? "2026.10.14" : "2026.10.15").replace("</main>", navigation + "</main>") })
  })
  const history = await context.newPage(); await history.goto(url)
  await sync(ui, history)
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), url)
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 20000 }).toBe("completed")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.records).toHaveLength(6)
  expect(snapshot.historyRun).toMatchObject({ pages: 2, processed: 10 })
  expect(snapshot.historyCompletions?.remember).toBeTruthy()
})

test("리멤버 지원 목록: 자동 가져오기와 같은 URL의 기간 변경 감지", async ({ ui, context }) => {
  const url = "https://profile.rememberapp.co.kr/applies"
  await enableHistoryAuto(ui)
  const next = '<nav aria-label="페이지"><strong aria-current="page">1</strong><button id="next" aria-label="다음 페이지">다음</button></nav><script>document.querySelector("#next").onclick=()=>{document.querySelector("[aria-haspopup=listbox]").textContent="최근 1개월";document.querySelector("h4").textContent="다른 조건의 직무"}</script>'
  await context.route("https://profile.rememberapp.co.kr/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("remember-history.html").replace("</main>", next + "</main>") }))
  const history = await context.newPage(); await history.goto(url)
  await expect.poll(async () => {
    const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    return { count: snapshot.records.length, report: snapshot.reports.remember, auto: snapshot.settings.historyAutoCollect }
  }, { timeout: 15000 }).toMatchObject({ count: 5, auto: true })
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), url)
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun, { timeout: 20000 }).toMatchObject({ status: "error" })
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.historyRun?.message).toContain("조회 조건")
  expect(snapshot.historyRun?.pages).toBe(1)
})

for (const mode of ["navigation", "spa", "spa-from-list", "changed-classes", "fast-navigation", "click-only", "direct-result", "opened-only", "wrong-job", "disabled", "synthetic-click"] as const) {
test(`원티드 제출: 클릭은 대기, 완료 경로로 확정 ${mode}`, async ({ ui, context }) => {
  if (mode === "disabled") {
    const initial = await rpc<Snapshot>(ui, { type: "snapshot" })
    await rpc(ui, { type: "settings", settings: { ...initial.settings, consent: { ...initial.settings.consent, wanted: false } } })
  }
  const sourceUrl = "https://www.wanted.co.kr/wd/392849"
  const resultPath = mode === "wrong-job" ? "/wd/99/applied" : "/wd/392849/applied"
  await context.route("https://www.wanted.co.kr/**", route => {
    if (new URL(route.request().url()).pathname.endsWith("/applied")) return route.fulfill({ contentType: "text/html; charset=utf-8", body: "<main><h1>가상 지원 완료</h1></main>" })
    const action = mode === "spa" || mode === "spa-from-list" ? `history.pushState({},'', '${resultPath}')` : mode === "click-only" ? "button.dataset.waiting='true'" : `location.assign('${resultPath}')`
    const script = `<script>const button=document.querySelector('button');button.onclick=()=>{${action}};</script>`
    const form = mode === "changed-classes" ? fixture("wanted-submission.html").replaceAll("Applying_container__cuvYP", "NewModal").replaceAll("Applying_footer__gi8jM", "NewFooter") : fixture("wanted-submission.html")
    if (mode === "spa-from-list" && new URL(route.request().url()).pathname === "/wdlist") return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<button id="open">공고 열기</button><script>document.querySelector('#open').onclick=()=>{history.pushState({},'', '/wd/392849');document.body.innerHTML=${JSON.stringify(form)};const button=document.querySelector('button');button.onclick=()=>{${action}}}</script>` })
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: form + script })
  })
  const page = await context.newPage()
  await page.goto(mode === "spa-from-list" ? "https://www.wanted.co.kr/wdlist" : sourceUrl + (mode === "direct-result" ? "/applied" : ""))
  if (mode === "spa-from-list") await page.getByRole("button", { name: "공고 열기", exact: true }).click()
  if (mode !== "disabled" && mode !== "direct-result" && mode !== "fast-navigation") await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.stage).toBe("started")
  expect(await count(ui)).toBe(0)
  if (mode === "opened-only") await page.goto(sourceUrl + "/applied")
  else if (mode === "synthetic-click") await page.getByRole("button", { name: "제출하기", exact: true }).evaluate(button => (button as HTMLButtonElement).click())
  else if (mode !== "direct-result") await page.getByRole("button", { name: "제출하기", exact: true }).click()
  if (["navigation", "spa", "spa-from-list", "changed-classes", "fast-navigation"].includes(mode)) {
    await expect(page).toHaveURL(sourceUrl + "/applied")
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.status).toBe("applied")
    const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    expect(snapshot.records).toHaveLength(1)
    expect(snapshot.records[0]).toMatchObject({ platform: "wanted", companyName: "가상 원티드 기업", jobTitle: "프론트엔드 개발자", sourceJobId: "392849", jobUrl: sourceUrl, evidence: "success_page" })
    expect(snapshot.records[0]?.sourceApplicationId).toBeUndefined()
    expect(snapshot.records[0]?.appliedAtTime).toBeTruthy()
    await page.reload()
    expect(await count(ui)).toBe(1)
    await expect(ui.getByRole("region", { name: "지원 진행 상태" })).toHaveCount(0)
  } else {
    await page.waitForTimeout(1200)
    expect(await count(ui)).toBe(0)
  }
  expect(JSON.stringify(await ui.evaluate(() => chrome.storage.local.get(null)))).not.toMatch(/PRIVATE_NAME|PRIVATE_EMAIL|PRIVATE_RESUME|data-apply-id/)
  expect(JSON.stringify(await rpc(ui, { type: "backup" }))).not.toMatch(/PRIVATE_NAME|PRIVATE_EMAIL|PRIVATE_RESUME|data-apply-id/)
})
}

for (const [theme, scheme] of [["light", "light"], ["dark", "dark"], ["system", "dark"], ["system", "light"]] as const) {
test(`이력 안내 글자 대비: ${theme} ${scheme}`, async ({ ui, context }) => {
  const initial = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...initial.settings, theme } })
  const prior = record({ platform: "wanted", companyName: "에이티씨아이", normalizedCompanyName: "에이티씨아이", jobTitle: "소프트웨어 엔지니어 (Full Stack)", sourceApplicationId: "contrast-fixture", appliedAt: undefined, sourceCreatedAt: "2026-03-19T10:00:00+09:00", sourceStatus: "불합격", jobUrl: "https://www.wanted.co.kr/wd/100" })
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [prior] } })
  const source = publicMetadata.wantedDetail
  const forced = scheme === "dark" ? "#000" : "#fff"
  const style = `<style>body{background:${scheme === "dark" ? "#111" : "#fff"};color:${forced};-webkit-text-fill-color:${forced}}todaystart-warning{color:${forced}!important}</style>`
  const html = fixture("public/wantedDetail.html").replaceAll(source.expected[0]!.companyName, "에이티씨아이") + style
  await context.route(source.sourceUrl, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: html }))
  const page = await context.newPage()
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto(source.sourceUrl)
  const warning = page.locator("todaystart-warning")
  await expect(warning.getByText("에이티씨아이", { exact: true })).toBeVisible()
  await expect(warning).toContainText("2026.03.19 · 불합격")
  const colors = await warning.evaluate(host => {
    const details = host.shadowRoot!.querySelector("details")!
    const bg = getComputedStyle(details).backgroundColor
    const luminance = (color: string) => {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => { const v=value/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4 })
      return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
    }
    const background = luminance(bg)
    return [...host.shadowRoot!.querySelectorAll("summary,p,small,a")].map(element => {
      const style = getComputedStyle(element), text = style.webkitTextFillColor || style.color
      const foreground = luminance(text)
      return { color: style.color, fill: text, contrast: (Math.max(foreground, background)+0.05)/(Math.min(foreground, background)+0.05) }
    })
  })
  for (const color of colors) {
    expect(color.fill).toBe(color.color)
    expect(color.contrast).toBeGreaterThanOrEqual(4.5)
  }
  await page.screenshot({ path: `test-results/warning-contrast-${theme}-${scheme}.png` })
})
}

for (const transport of ["fetch", "xhr"] as const) {
  test(`최종 제출 관찰: 사람인 iframe ${transport}, 실패 응답 → 재시도 성공 → 한 건 승격`, async ({ ui, context }) => {
    let success = false, posts = 0, release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    await context.route("https://www.saramin.co.kr/**", async route => {
      const path = new URL(route.request().url()).pathname
      if (path === "/zf_user/member/apply/apply") {
        posts++
        if (posts === 1) await gate
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ code: success ? "success" : "duplicate", rec_idx: 12345, recruitapply_idx: 7788, content: "PRIVATE_CONTENT", resume: "PRIVATE_RESUME" }) })
      }
      if (path.endsWith("/check-open-layer-condition")) return route.fulfill({ contentType: "application/json", body: '{"code":"success"}' })
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: path === "/zf_user/member/apply" ? saraminSubmissionPage(transport) : saraminSubmissionDetail(transport) })
    })
    const detail = await context.newPage()
    await detail.goto("https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=12345")
    const frame = detail.frameLocator('iframe[title="지원창"]')
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.stage).toBe("started")
    expect(await count(ui)).toBe(0)
    await frame.getByRole("button", { name: "지원창 조건 확인" }).click()
    expect(await count(ui)).toBe(0)
    // Analytics or unmatched success events cannot create a completed record.
    await detail.frames()[1]!.evaluate(() => document.dispatchEvent(new CustomEvent("todaystart:submission:v1", { detail: JSON.stringify({ kind: "result", platform: "saramin", sourceJobId: "12345", requestId: crypto.randomUUID(), outcome: "success", sourceApplicationId: "8888" }) })))
    expect(await count(ui)).toBe(0)
    await frame.getByRole("button", { name: "입사지원", exact: true }).click()
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.submissionStage).toBe("submitting")
    expect((await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.appliedAt).toBeUndefined()
    release()
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.submissionStage).toBe("unverified")
    expect((await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.status).toBe("pending_confirmation")
    await ui.screenshot({ path: `docs/screenshots/submission-${transport}-unverified.png`, fullPage: true })
    success = true
    await frame.getByRole("button", { name: "입사지원", exact: true }).click()
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.status).toBe("applied")
    const final = await rpc<Snapshot>(ui, { type: "snapshot" })
    expect(final.records).toHaveLength(1)
    expect(final.records[0]).toMatchObject({ companyName: "가상 제출 기업", sourceApplicationId: "7788", sourceJobId: "12345", evidence: "submission_result" })
    expect(final.submissionAttempts?.[0]?.stage).toBe("confirmed")
    expect(posts).toBe(2)
    const persisted = await ui.evaluate(() => chrome.storage.local.get(null))
    expect(JSON.stringify(persisted)).not.toMatch(/PRIVATE_RESUME|PRIVATE_TOKEN|PRIVATE_CONTENT/)
    expect(JSON.stringify(await rpc(ui, { type: "backup" }))).not.toMatch(/PRIVATE_RESUME|PRIVATE_TOKEN|PRIVATE_CONTENT/)
    await ui.reload()
    expect((await rpc<Snapshot>(ui, { type: "snapshot" })).records).toHaveLength(1)
  })
}

for (const popupKind of ["opener", "noopener", "script"] as const) {
test(`최종 제출 관찰: 잡코리아 서로 다른 ID, ${popupKind} 팝업 form.submit은 확인 필요로 유지`, async ({ ui, context }) => {
  let posts = 0
  await context.route("https://www.jobkorea.co.kr/**", route => {
    const path = new URL(route.request().url()).pathname
    if (path === "/Recruit/OnPass/OnPassApply") {
      expect(route.request().method()).toBe("POST"); posts++
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<h1>가상 결과 화면</h1><p>필수 정보를 확인해 주세요.</p><button data-tracking="입사지원완료">지원하기</button>' })
    }
    const detail = jobkoreaSubmissionDetail.replace("giNo=12345", "giNo=51797123")
    const posting = popupKind === "script" ? detail.replace('<a target="_blank" href="/Recruit/OnPass?giNo=51797123">지원창 열기</a>', '<button onclick="window.open(\'/Recruit/OnPass?giNo=51797123\')">지원창 열기</button>') : popupKind === "noopener" ? detail.replace('target="_blank"', 'target="_blank" rel="noopener"') : detail
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: path === "/Recruit/OnPass" ? jobkoreaSubmissionPage : posting })
  })
  const detail = await context.newPage(); await detail.goto("https://www.jobkorea.co.kr/Recruit/GI_Read/50194254")
  await expect.poll(async () => (await ui.evaluate(() => chrome.storage.local.get("submissionContexts"))).submissionContexts).toBeTruthy()
  const opened = context.waitForEvent("page")
  await detail.getByRole(popupKind === "script" ? "button" : "link", { name: "지원창 열기" }).click()
  const application = await opened
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.stage).toBe("started")
  expect(await count(ui)).toBe(0)
  await application.getByRole("button", { name: "지원하기", exact: true }).click()
  await expect(application).toHaveURL(/OnPassApply$/)
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.submissionStage).toBe("unverified")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.records).toHaveLength(1)
  expect(snapshot.records[0]).toMatchObject({ platform: "jobkorea", status: "pending_confirmation", evidence: "submission_attempt", sourceJobId: "50194254", internalGiNo: "51797123", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/50194254" })
  expect(snapshot.records[0]?.appliedAt).toBeUndefined()
  expect(posts).toBe(1)
  await ui.reload()
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await expect(ui.getByRole("region", { name: "지원 진행 상태" })).toContainText("완료 표시를 아직 확인할 수 없어")
  await ui.screenshot({ path: "docs/screenshots/submission-jobkorea-unverified.png", fullPage: true })
  await ui.getByRole("button", { name: "완료 여부 확인", exact: true }).click()
  await ui.getByRole("dialog").getByLabel("지원 날짜").fill("2026-10-20")
  await ui.getByRole("dialog").getByLabel("상태").selectOption("applied")
  await ui.getByRole("button", { name: "변경 저장", exact: true }).click()
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]).toMatchObject({ stage: "confirmed", reason: "manual" })
})
}

for (const outcome of ["unverified", "confirmed"] as const) {
  test(`잡코리아 현재 상세 + href 없는 noopener 버튼: ${outcome}`, async ({ ui, context }) => {
    let posts = 0
    await context.route("https://www.jobkorea.co.kr/**", route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === "/Recruit/OnPass/OnPassApply") {
        posts++
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: outcome === "confirmed" ? '<button class="new-react-layout" data-applymode="ONLINE" data-activity="APPLY_COMPLETE">추가지원</button>' : '<h1>결과 확인 필요</h1>' })
      }
      const detail = fixture("public/jobkoreaCurrentDetail.html").replace("</main>", `<button onclick="window.open('/Recruit/OnPass?giNo=51773591','_blank','noopener')">즉시 지원 테스트</button></main>`)
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: pathname === "/Recruit/OnPass" ? jobkoreaSubmissionPage : detail })
    })
    const detail = await context.newPage()
    await detail.goto("https://www.jobkorea.co.kr/Recruit/GI_Read/50167228")
    await expect.poll(() => ui.evaluate(async () => {
      const state = await chrome.storage.local.get("submissionContexts")
      return (state.submissionContexts as { context?: { companyName?: string } }[] | undefined)?.[0]?.context?.companyName
    })).toBe("㈜셀파트너랩스")
    const opened = context.waitForEvent("page")
    await detail.getByRole("button", { name: "즉시 지원 테스트", exact: true }).click()
    const application = await opened
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.context?.sourceJobId).toBe("50167228")
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.context?.internalGiNo).toBe("51773591")
    expect(await application.evaluate(() => window.opener)).toBeNull()
    await application.getByRole("button", { name: "지원하기", exact: true }).click()
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.stage).toBe(outcome)
    const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    expect(snapshot.records).toHaveLength(1)
    expect(snapshot.records[0]).toMatchObject({ companyName: "㈜셀파트너랩스", jobTitle: "[셀파트너랩스] AI 커머스 스타트업 프론트엔드 개발자 모집", sourceJobId: "50167228", internalGiNo: "51773591", status: outcome === "confirmed" ? "applied" : "pending_confirmation" })
    expect(posts).toBe(1)
    if (outcome === "confirmed") await ui.screenshot({ path: "test-results/jobkorea-current-detail-confirmed.png", fullPage: true })
  })
}

const jobkoreaCompletionButton = '<div class="page-footer"><button type="button" class="footer-btn apply-button devApplyMultiBtn" disabled onclick="handleMultiApplyClick(event)" data-sc="9" data-applymode="ONLINE" data-activity="APPLY_COMPLETE"><span>추가지원</span></button></div>'
for (const mode of ["popup", "iframe", "search", "reload-pending", "wrong-gno", "no-marker", "initial-result"] as const) {
test(`잡코리아 실제 결과 URL OnPassResult: ${mode}`, async ({ ui, context }) => {
  const publicId = "50189229", internalGiNo = "51797123"
  const applicationUrl = `/Recruit/OnPass?giNo=${internalGiNo}&Pass_Match=1&pass_chk=1&logpath=1&sc=630`
  // Only the route and the supplied footer come from the reported real flow.
  // The company, resume/part/pass parameters and server behavior are synthetic.
  const resultUrl = `/Recruit/OnPass/OnPassResult?gNo=${mode === "wrong-gno" ? "99" : publicId}&R_No=111&PartIdx=222&co_pass_no=333&logpath=1&sc=630`
  let posts = 0, resultVisible = mode !== "reload-pending"
  await context.route("https://www.jobkorea.co.kr/**", route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === "/Recruit/OnPass/OnPassApply") {
      expect(route.request().method()).toBe("POST")
      posts++
      // Start a separate navigation so the result is also fully routed locally;
      // Playwright does not re-route a browser's HTTP redirect chain.
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<script>location.replace(${JSON.stringify(resultUrl)})</script>` })
    }
    if (pathname === "/Recruit/OnPass/OnPassResult") {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<h1>가상 결과 화면</h1>${resultVisible && mode !== "no-marker" ? jobkoreaCompletionButton : "<p>결과 표시 대기</p>"}` })
    }
    if (pathname === "/Recruit/OnPass") return route.fulfill({ contentType: "text/html; charset=utf-8", body: jobkoreaSubmissionPage })
    const launch = mode === "iframe"
      ? `const f=document.createElement('iframe');f.title='지원창';f.src='${applicationUrl}';document.body.append(f)`
      : `window.open('${applicationUrl}','_blank','noopener')`
    const source = mode === "search"
      ? `<main><div data-sentry-component="CardJob"><a data-sentry-component="Title" href="/Recruit/GI_Read/${publicId}"><span>웹 개발자</span></a><a href="/Recruit/GI_Read/${publicId}"><span>가상 제출 기업</span></a><button onclick="${launch}">지원창 열기</button></div></main>`
      : jobkoreaSubmissionDetail.replace('<a target="_blank" href="/Recruit/OnPass?giNo=12345">지원창 열기</a>', `<button onclick="${launch}">지원창 열기</button>`)
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: source })
  })
  if (mode === "initial-result") {
    const page = await context.newPage()
    await page.goto(`https://www.jobkorea.co.kr${resultUrl}`)
    await page.waitForTimeout(1200)
    expect(await count(ui)).toBe(0)
    return
  }
  const source = await context.newPage()
  const sourceUrl = mode === "search" ? "https://www.jobkorea.co.kr/Search?stext=react&Page_No=5" : `https://www.jobkorea.co.kr/Recruit/GI_Read/${publicId}`
  await source.goto(sourceUrl)
  await pageMessage(ui, sourceUrl, "GET_PAGE")
  const opened = mode === "iframe" ? undefined : context.waitForEvent("page")
  await source.getByRole("button", { name: "지원창 열기", exact: true }).click()
  const popup = opened ? await opened : undefined
  const application = popup || source.frameLocator('iframe[title="지원창"]')
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.context?.sourceJobId).toBe(publicId)
  await application.getByRole("button", { name: "지원하기", exact: true }).click()
  if (popup) await expect(popup).toHaveURL(/\/OnPassResult\?gNo=/)
  else await expect.poll(() => source.frames().some(frame => frame.url().includes("/OnPassResult?gNo="))).toBe(true)
  if (mode === "reload-pending") {
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.submissionStage).toBe("unverified")
    resultVisible = true
    await popup!.reload()
  }
  if (mode === "wrong-gno" || mode === "no-marker") {
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.submissionStage).toBe("unverified")
    await source.waitForTimeout(1200)
    expect((await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.status).toBe("pending_confirmation")
    return
  }
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.status).toBe("applied")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.records).toHaveLength(1)
  expect(snapshot.records[0]).toMatchObject({ sourceJobId: publicId, internalGiNo, submissionStage: "confirmed", evidence: "success_page" })
  await expect(ui.getByRole("region", { name: "지원 진행 상태" })).toHaveCount(0)
  expect(posts).toBe(1)
  if (popup) await popup.reload()
  await ui.reload()
  expect(await count(ui)).toBe(1)
  expect(JSON.stringify(await ui.evaluate(() => chrome.storage.local.get(null)))).not.toMatch(/R_No|PartIdx|co_pass_no/)
})
}

for (const mode of ["popup-transition", "popup-replaced", "iframe-transition", "source-card", "preexisting", "cancelled", "wrong-card"] as const) {
test(`잡코리아 검색에서 즉시 지원: ${mode}`, async ({ ui, context }) => {
  const sourceId = "50151449", internalId = "51759411"
  const url = "/Recruit/OnPass?giNo=51759411&Pass_Match=1&pass_chk=1&logpath=1&sc=630"
  const searchUrl = "https://www.jobkorea.co.kr/Search?stext=react&Page_No=5"
  const iframe = mode === "iframe-transition"
  await context.route("https://www.jobkorea.co.kr/**", route => {
    if (new URL(route.request().url()).pathname === "/Recruit/OnPass") {
      const action = mode === "popup-replaced" ? "b.outerHTML='<button class=changed-footer disabled>추가지원</button>'" : /transition/.test(mode) ? "b.textContent='추가지원';b.disabled=true" : "b.dataset.clicked='true'"
      const oldMarker = mode === "preexisting" ? jobkoreaCompletionButton : ""
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: `${oldMarker}<button id="final" class="current-layout"><span>지원하기</span></button><script>document.querySelector('#final').onclick=()=>{const b=document.querySelector('#final');${action}}</script>` })
    }
    const open = iframe ? `const f=document.createElement('iframe');f.title='실제 구조 지원 모달';f.src='${url}';document.body.append(f)` : `window.open('${url}','_blank','noopener')`
    const card = (id: string, company: string, launch: string) => `<div data-sentry-component="CardJob"><a data-sentry-component="Title" href="/Recruit/GI_Read/${id}"><span>웹 개발자 ${id}</span></a><a href="/Recruit/GI_Read/${id}"><span>${company}</span></a><button onclick="${launch}">즉시 지원</button></div>`
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<main>${card(sourceId, "모달 추적 검증 기업", open)}${card("99", "다른 기업", "")}</main>` })
  })
  const search = await context.newPage()
  await search.goto(searchUrl)
  await pageMessage(ui, searchUrl, "GET_PAGE")
  const opened = iframe ? undefined : context.waitForEvent("page")
  await search.getByRole("button", { name: "즉시 지원", exact: true }).first().click()
  const popup = opened ? await opened : undefined
  const application = popup || search.frameLocator('iframe[title="실제 구조 지원 모달"]')
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.context?.sourceJobId).toBe(sourceId)
  expect(await count(ui)).toBe(0)
  await application.getByRole("button", { name: "지원하기", exact: true }).click()
  if (mode === "source-card" || mode === "wrong-card") {
    await search.locator('[data-sentry-component="CardJob"]').nth(mode === "wrong-card" ? 1 : 0).evaluate((element, marker) => { element.insertAdjacentHTML("beforeend", marker) }, jobkoreaCompletionButton)
    await popup?.close()
  }
  if (["cancelled", "preexisting", "wrong-card"].includes(mode)) {
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.clickedAt).toBeTruthy()
    await search.waitForTimeout(1200)
    expect(await count(ui)).toBe(0)
    return
  }
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.status).toBe("applied")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.records).toHaveLength(1)
  expect(snapshot.records[0]).toMatchObject({ sourceJobId: sourceId, internalGiNo: internalId, companyName: "모달 추적 검증 기업", evidence: "success_page", submissionStage: "confirmed" })
  await expect(ui.getByRole("region", { name: "지원 진행 상태" })).toHaveCount(0)
  await expect(search).toHaveURL(searchUrl)
  if (mode === "popup-transition" && popup) await popup.screenshot({ path: "test-results/jobkorea-search-popup-additional.png" })
})
}

for (const presentation of ["popup", "link", "iframe"] as const) {
test(`잡코리아 2단계 지원: ${presentation}, 새 버튼 클래스와 공고 화면의 완료 표시`, async ({ ui, context }) => {
  const publicId = "50151449", internalGiNo = "51759411"
  const applicationUrl = `/Recruit/OnPass?giNo=${internalGiNo}&Pass_Match=1&pass_chk=1&logpath=1&sc=630`
  await context.route("https://www.jobkorea.co.kr/**", route => {
    const pathname = new URL(route.request().url()).pathname
    const launch = presentation === "iframe"
      ? `const f=document.createElement('iframe');f.title='지원 모달';f.src='${applicationUrl}';document.body.append(f)`
      : `window.open('${applicationUrl}','_blank','noopener')`
    const openingControl = presentation === "link" ? `<a target="_blank" rel="noopener" href="${applicationUrl}">지원하기</a>` : `<button onclick="${launch}">지원하기</button>`
    const detail = `<title>가상 2단계 기업 채용 - 프론트엔드 개발자 | 잡코리아</title><main><div data-sentry-component="TitleContent"><h1>프론트엔드 개발자</h1></div>${openingControl}<div id="completion"></div></main>`
    const application = '<h1>지원 모달</h1><button class="changed-layout"><span>지원하기</span></button><p id="result"></p><script>document.querySelector("button").onclick=()=>{document.querySelector("#result").textContent="가상 제출 처리 중"}</script>'
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: pathname === "/Recruit/OnPass" ? application : detail })
  })
  const detail = await context.newPage()
  await detail.goto(`https://www.jobkorea.co.kr/Recruit/GI_Read/${publicId}?Oem_Code=C1&logpath=1&stext=react&listno=87&sc=630`)
  await expect.poll(() => ui.evaluate(async () => {
    const stored = await chrome.storage.local.get("submissionContexts")
    return (stored.submissionContexts as { context?: { sourceJobId?: string } }[] | undefined)?.[0]?.context?.sourceJobId
  })).toBe(publicId)
  const opened = presentation === "iframe" ? undefined : context.waitForEvent("page")
  await detail.getByRole(presentation === "link" ? "link" : "button", { name: "지원하기", exact: true }).click()
  const popup = opened ? await opened : undefined
  const application = popup || detail.frameLocator('iframe[title="지원 모달"]')
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.stage).toBe("started")
  expect(await count(ui)).toBe(0)
  if (popup) expect(await popup.evaluate(() => window.opener)).toBeNull()
  await application.getByRole("button", { name: "지원하기", exact: true }).locator("span").click()
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.stage).toBe("submitting")
  expect(await count(ui)).toBe(0)
  // The site reports success on the original posting after closing its modal.
  // No real application request or user data is sent by this fixture.
  await detail.locator("#completion").evaluate((element, html) => { element.innerHTML = html }, jobkoreaCompletionButton)
  if (popup) await popup.close()
  else await detail.locator("iframe").evaluate(element => element.remove())
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.status).toBe("applied")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.records).toHaveLength(1)
  expect(snapshot.records[0]).toMatchObject({ sourceJobId: publicId, internalGiNo, companyName: "가상 2단계 기업", jobTitle: "프론트엔드 개발자", evidence: "success_page" })
  await ui.reload()
  expect(await count(ui)).toBe(1)
})
}

for (const mode of ["navigation", "attribute-late", "attribute-only", "click-only", "initial-marker", "hidden-marker", "tracking-only", "disabled"] as const) {
test(`잡코리아 버튼 완료 관찰: ${mode}`, async ({ ui, context }) => {
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  let posts = 0
  if (mode === "disabled") {
    const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    await rpc(ui, { type: "settings", settings: { ...snapshot.settings, autoRecord: false } })
  }
  await context.route("https://www.jobkorea.co.kr/**", route => {
    const path = new URL(route.request().url()).pathname
    if (path === "/Recruit/OnPass/OnPassApply") {
      posts++
      const body = mode === "hidden-marker" ? `<div hidden>${jobkoreaCompletionButton}</div>` : mode === "tracking-only" ? '<button class="footer-btn dev-btn-apply" data-activity="APPLY_COMPLETE">지원하기</button>' : jobkoreaCompletionButton
      return route.fulfill({ contentType: "text/html; charset=utf-8", body })
    }
    const attributes = `b.className='footer-btn apply-button devApplyMultiBtn';b.disabled=true;b.dataset.applymode='ONLINE';b.dataset.activity='APPLY_COMPLETE';b.innerHTML='<span>추가지원</span>'`
    const inline = `<form id="devForm" method="post" action="/Recruit/OnPass/OnPassApply"><div class="page-footer"><button type="button" class="footer-btn dev-btn-apply">지원하기</button></div></form><script>document.querySelector('button').onclick=()=>{const b=document.querySelector('button');${mode === "attribute-late" ? `setTimeout(()=>{${attributes}},16000)` : mode === "attribute-only" ? `${attributes};b.dataset.activity='WAITING';setTimeout(()=>{b.dataset.activity='APPLY_COMPLETE'},300)` : attributes}};</script>`
    const application = mode === "initial-marker" ? jobkoreaCompletionButton : ["attribute-late", "attribute-only", "click-only"].includes(mode) ? inline : jobkoreaSubmissionPage
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: path === "/Recruit/OnPass" ? application : jobkoreaSubmissionDetail.replace("giNo=12345", "giNo=51797123") })
  })
  const detail = await context.newPage()
  await detail.goto("https://www.jobkorea.co.kr/Recruit/GI_Read/50194254")
  const opened = context.waitForEvent("page")
  await detail.getByRole("link", { name: "지원창 열기" }).click()
  const application = await opened
  await application.waitForLoadState("domcontentloaded")
  if (mode !== "disabled") await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.[0]?.stage, { timeout: 15000 }).toBe("started")
  if (mode !== "initial-marker") await application.getByRole("button", { name: "지원하기", exact: true }).click()
  if (["initial-marker", "hidden-marker", "tracking-only", "disabled"].includes(mode)) {
    if (mode === "hidden-marker" || mode === "tracking-only") await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.submissionStage).toBe("unverified")
    await application.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)))
    expect((await rpc<Snapshot>(ui, { type: "snapshot" })).records.filter(record => record.status === "applied")).toHaveLength(0)
    return
  }
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.status, { timeout: 25000 }).toBe("applied")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.records).toHaveLength(1)
  expect(snapshot.records[0]).toMatchObject({ sourceJobId: "50194254", internalGiNo: "51797123", evidence: "success_page", submissionStage: "confirmed" })
  expect(snapshot.records[0]?.sourceApplicationId).toBeUndefined()
  expect(posts).toBe(mode === "navigation" ? 1 : 0)
  await expect(ui.getByRole("table")).toContainText("지원 완료")
  await application.reload()
  await ui.reload()
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).records).toHaveLength(1)
  await expect(ui.getByRole("table")).toContainText("지원 완료")
})
}

for (const completion of ["valid", "missing-heading", "hidden-heading", "missing-id", "disabled"] as const) {
test(`완료 iframe 관찰: src about:blank 유지, ${completion}`, async ({ ui, context }) => {
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  if (completion === "disabled") {
    const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    await rpc(ui, { type: "settings", settings: { ...snapshot.settings, autoRecord: false } })
  }
  await context.route("https://www.saramin.co.kr/**", route => {
    const url = new URL(route.request().url())
    const body = url.pathname.endsWith("/complete")
      ? completion === "missing-heading" ? "<h1>지원 결과 확인 필요</h1>" : completion === "hidden-heading" ? '<h1 hidden>입사지원 완료!</h1><p>지원 오류</p>' : "<h1>입사지원 완료!</h1>"
      : saraminSubmissionDetail("fetch").replace(/<iframe[\s\S]*$/, `<iframe id="quick_apply_frame" name="quick_apply_frame" title="지원창" src="about:blank"></iframe><form method="get" action="/zf_user/member/apply/complete" target="quick_apply_frame"><input type="hidden" name="rec_idx" value="12345">${completion === "missing-id" ? "" : '<input type="hidden" name="recruitapply_idx" value="7788">'}<button>가상 완료 문서 열기</button></form>`)
    return route.fulfill({ contentType: "text/html; charset=utf-8", body })
  })
  const detail = await context.newPage()
  await detail.goto("https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=12345")
  if (completion !== "disabled") await expect.poll(async () => (await ui.evaluate(() => chrome.storage.local.get("submissionContexts"))).submissionContexts, { timeout: 15000 }).toBeTruthy()
  await detail.getByRole("button", { name: "가상 완료 문서 열기" }).click()
  const frame = detail.frames().find(frame => frame.url().includes("/apply/complete")) || await detail.waitForEvent("framenavigated", frame => frame.url().includes("/apply/complete"))
  await frame.waitForLoadState("domcontentloaded")
  await expect(detail.locator("#quick_apply_frame")).toHaveAttribute("src", "about:blank")
  if (completion !== "valid") {
    // Wait for content-script IPC after the completed document has loaded.
    await frame.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)))
    expect(await count(ui)).toBe(0)
    return
  }
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.status).toBe("applied")
  const record = (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]!
  expect(record).toMatchObject({ sourceJobId: "12345", sourceApplicationId: "7788", evidence: "success_page", companyName: "가상 제출 기업" })
  expect(record.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await expect(ui.getByRole("table")).toContainText("가상 제출 기업")
  await frame.goto(frame.url())
  await ui.reload()
  await expect(ui.getByRole("table")).toContainText("가상 제출 기업")
  expect(await count(ui)).toBe(1)
})
}

test("최종 제출 관찰: 수집 끄기 준수와 기본 수동 지원 현황 가져오기", async ({ ui, context }) => {
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.settings.historyAutoCollect).toBe(false)
  await context.route("https://www.saramin.co.kr/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: new URL(route.request().url()).pathname.includes("apply-status-list") ? fixture("semantic-history.html") : saraminSubmissionPage("fetch") }))
  const history = await context.newPage(); await history.goto("https://www.saramin.co.kr/zf_user/persons/apply-status-list")
  await pageMessage(ui, history.url(), "GET_PAGE")
  expect(await count(ui)).toBe(0)
  await sync(ui, history)
  expect(await count(ui)).toBe(2)
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, autoRecord: false } })
  const application = await context.newPage(); await application.goto("https://www.saramin.co.kr/zf_user/member/apply?rec_idx=12345")
  await application.getByRole("button", { name: "입사지원", exact: true }).click()
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).submissionAttempts?.length || 0).toBe(0)
  expect(await count(ui)).toBe(2)
})

test("수집 토스트: 원인·사이트·보존 범위, 읽는 동안 유지, 자동 닫기와 재표시 방지", async ({ ui }) => {
  await ui.clock.install()
  const now = new Date().toISOString()
  const run = { id: "toast-error", platform: "saramin", tabId: 999999, status: "error", issue: "login_required", pages: 2, processed: 20, inserted: 18, updated: 2, skipped: 0, scope: "현재 조건", message: "raw internal detail", startedAt: now, updatedAt: now }
  await ui.evaluate(run => chrome.storage.session.set({ historyRun: run }), run)
  const toast = ui.locator(".history-run-toast")
  await expect(toast).toContainText("사람인 · 로그인이 필요해요")
  await expect(toast).toContainText("2페이지까지 확인 · 18건 추가 · 2건 갱신")
  await expect(toast).not.toContainText("raw internal detail")
  await expect(ui.locator("main .collection-progress")).toHaveCount(0)
  await toast.hover()
  await ui.clock.fastForward(20000)
  await expect(toast).toBeVisible()
  await ui.screenshot({ path: ".tmp/collection-toast-desktop.png" })
  await toast.getByRole("button", { name: "사람인 열기" }).focus()
  await ui.mouse.move(0, 0)
  await ui.clock.fastForward(20000)
  await expect(toast).toBeVisible()
  await ui.getByRole("button", { name: "대시보드", exact: true }).focus()
  await ui.clock.fastForward(12001)
  await expect(toast).toHaveCount(0)
  await expect.poll(() => ui.evaluate(async () => (await chrome.storage.local.get("dismissedHistoryRun")).dismissedHistoryRun)).toBe("toast-error:error")
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await ui.getByRole("button", { name: "대시보드", exact: true }).click()
  await expect(toast).toHaveCount(0)
  await ui.getByRole("button", { name: "설정", exact: true }).click()
  await ui.evaluate(run => chrome.storage.session.set({ historyRun: { ...run, id: "toast-done", status: "completed", issue: undefined } }), run)
  await ui.clock.fastForward(20000)
  await expect(toast).toHaveCount(0)
  await ui.getByRole("button", { name: "대시보드", exact: true }).click()
  await expect(toast).toContainText("사람인 · 가져오기 완료")
  await ui.clock.fastForward(6001)
  await expect(toast).toHaveCount(0)
  await ui.reload()
  await expect(toast).toHaveCount(0)
})

test("설정 별점 버튼: 도움말 위 배치와 새 탭, 작은 화면·다크 모드", async ({ ui }) => {
  await ui.getByRole("button", { name: "설정", exact: true }).click()
  const link = ui.getByRole("link", { name: "웹 스토어 별점 주기 (새 탭)", exact: true })
  const url = "https://chromewebstore.google.com/detail/dhgfnibbnjieajcmnohdkiandeljeaef?utm_source=item-share-cb"
  await expect(link).toHaveAttribute("href", url)
  await expect(link).toHaveAttribute("target", "_blank")
  expect(await ui.locator(".settings-review").evaluate(el => el.nextElementSibling?.classList.contains("settings-support"))).toBe(true)
  await ui.getByRole("button", { name: "라이트", exact: true }).click()
  await ui.screenshot({ path: ".tmp/settings-review-desktop.png", fullPage: true })
  for (const width of [320, 390, 768]) {
    await ui.setViewportSize({ width, height: 844 })
    await link.scrollIntoViewIfNeeded()
    await expect(link).toBeInViewport()
    expect(await ui.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await ui.getByRole("button", { name: "다크", exact: true }).click()
  await ui.setViewportSize({ width: 390, height: 844 })
  await ui.locator(".settings-review").scrollIntoViewIfNeeded()
  await ui.screenshot({ path: ".tmp/settings-review-mobile-dark.png", fullPage: true })
})

test("사이트별 완료 체크 유지와 수집 완료 안내 닫기", async ({ ui, context, extensionId }) => {
  test.setTimeout(90000)
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  const initial = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...initial.settings, autoRecord: false } })
  const checked = async (surface: Page, platform: string) => {
    if (surface.url().includes("options.html")) {
      await expect(surface.locator(".records-imports")).not.toContainText("불러오는 중…")
      await expect(surface.locator(".records-imports .source-imports > li").filter({ hasText: platform }).locator(".import-source-copy strong svg")).toBeVisible()
    } else await expect(surface.getByRole("link", { name: `${platform} 지원 기록 가져오기`, exact: true }).locator(".task-checkbox.completed")).toBeVisible()
  }
  for (const platform of ["saramin", "jobkorea"] as const) {
    const url = platform === "saramin" ? "https://www.saramin.co.kr/zf_user/persons/apply-status-list" : "https://www.jobkorea.co.kr/User/ApplyMng?Page=1"
    await context.route(url, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<main><table><thead><tr><th>기업명</th><th>공고명</th><th>지원일</th><th>지원상태</th></tr></thead><tbody><tr><td>체크 유지 기업</td><td>웹 개발자</td><td>2026.10.19</td><td>지원 완료</td></tr></tbody></table><nav aria-label="페이지"><strong aria-current="page">1</strong><button aria-label="다음 페이지" disabled>다음</button></nav></main>` }))
    const history = await context.newPage(); await history.goto(url)
    await expect.poll(async () => { try { return (await pageMessage(ui, url, "GET_PAGE")).ok } catch { return false } }).toBe(true)
    const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), url)
    await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
    if (platform === "jobkorea") await checked(ui, "사람인")
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 20000 }).toBe("completed")
  }
  await checked(ui, "사람인")
  await checked(ui, "잡코리아")
  const completed = (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun!
  await ui.getByRole("button", { name: "수집 안내 닫기", exact: true }).click()
  await expect(ui.locator(".history-run-toast")).toHaveCount(0)
  await ui.reload()
  await expect(ui.locator(".history-run-toast")).toHaveCount(0)
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.locator(".collection-progress")).toHaveCount(0)
  await checked(popup, "사람인")
  await checked(popup, "잡코리아")
  // Clearing session state models a new browser session; local completion
  // history must remain even though the current progress banner is gone.
  await ui.evaluate(() => chrome.storage.session.remove("historyRun"))
  await ui.reload(); await popup.reload()
  await checked(ui, "사람인")
  await checked(popup, "잡코리아")
  expect(Object.keys((await rpc<Snapshot>(ui, { type: "snapshot" })).historyCompletions || {}).sort()).toEqual(["jobkorea", "saramin"])
  await ui.evaluate(async run => chrome.storage.session.set({ historyRun: { ...run, id: "new-error-run", status: "error", message: "새 수집 확인 필요" } }), completed)
  await expect(ui.locator(".history-run-toast")).toContainText("잡코리아 · 가져오기를 마치지 못했어요")
  await checked(ui, "사람인")
  await checked(ui, "잡코리아")
})

test("대시보드 채용 브랜드 말풍선: hover·키보드·터치·화면 경계", async ({ ui }) => {
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, theme: "light" } })
  await expect(ui.locator(".topbar")).toHaveCount(0)
  await expect(ui.getByRole("heading", { name: "지원 현황", exact: true })).toHaveCount(0)
  const trigger = ui.getByRole("button", { name: "채용 사이트 심벌 보기" })
  const cloud = ui.locator(".dashboard-platform-bubbles")
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await trigger.hover()
  await expect(cloud).toBeVisible()
  await expect(cloud.locator("img")).toHaveCount(3)
  await expect.poll(() => cloud.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
  for (const label of ["사람인", "잡코리아", "원티드"]) await expect(cloud.getByRole("img", { name: `${label} 로고`, exact: true })).toBeVisible()
  await expect(cloud.locator(".dashboard-site-name")).toHaveCount(0)
  await expect(cloud.getByText("리멤버", { exact: true })).toHaveCount(0)
  // Allow the short staggered entrance to finish before taking the preview.
  await expect(cloud.locator(".dashboard-site-bubble").last()).toHaveCSS("opacity", "1")
  await ui.screenshot({ path: "docs/screenshots/dashboard-bubbles-light.png", fullPage: true })
  const bubbleBox = (await cloud.boundingBox())!
  expect(bubbleBox.y).toBeGreaterThanOrEqual(0)
  const triggerBox = (await trigger.boundingBox())!
  expect(triggerBox.y - bubbleBox.y - bubbleBox.height).toBeLessThanOrEqual(10)
  await ui.mouse.move(bubbleBox.x + bubbleBox.width / 2, bubbleBox.y + bubbleBox.height / 2)
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await ui.mouse.move(0, 0)
  await expect(cloud).toBeHidden()
  await ui.keyboard.press("Tab")
  await trigger.focus()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await ui.keyboard.press("Escape")
  await expect(cloud).toBeHidden()
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, theme: "dark" } })
  await trigger.hover()
  await expect(cloud).toBeVisible()
  await expect(cloud.locator(".dashboard-site-bubble").last()).toHaveCSS("opacity", "1")
  await ui.screenshot({ path: "docs/screenshots/dashboard-bubbles-dark.png", fullPage: true })
  await ui.mouse.move(0, 0)
  await ui.locator("h1").click({ position: { x: 5, y: 5 } })
  await ui.setViewportSize({ width: 390, height: 844 })
  const cdp = await ui.context().newCDPSession(ui)
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true })
  const tap = async () => {
    const box = (await trigger.boundingBox())!
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  }
  await tap()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  const mobileBox = (await cloud.boundingBox())!
  expect(mobileBox.x).toBeGreaterThanOrEqual(15)
  expect(mobileBox.x + mobileBox.width).toBeLessThanOrEqual(375)
  expect(mobileBox.y).toBeGreaterThanOrEqual(0)
  const mobileTriggerBox = (await trigger.boundingBox())!
  expect(mobileTriggerBox.y - mobileBox.y - mobileBox.height).toBeLessThanOrEqual(10)
  expect(await ui.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(cloud.locator(".dashboard-site-bubble").last()).toHaveCSS("opacity", "1")
  await ui.screenshot({ path: "docs/screenshots/dashboard-bubbles-mobile.png", fullPage: true })
  await tap()
  await expect(cloud).toBeHidden()
  await ui.setViewportSize({ width: 320, height: 720 })
  await tap()
  await expect(cloud).toBeVisible()
  const narrowBox = (await cloud.boundingBox())!
  expect(narrowBox.x).toBeGreaterThanOrEqual(15)
  expect(narrowBox.x + narrowBox.width).toBeLessThanOrEqual(305)
  expect(await ui.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 10, y: 10 }] })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await expect(cloud).toBeHidden()
  await ui.emulateMedia({ reducedMotion: "reduce" })
  expect(await trigger.evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s")
})

test("대시보드 캘린더: 날짜별 기록·사이트 필터·월 이동·키보드", async ({ ui }) => {
  await ui.clock.setFixedTime(new Date("2026-10-20T12:00:00+09:00"))
  const samples = [
    record({ platform: "saramin", appliedAt: "2026-10-19" }),
    record({ platform: "saramin", appliedAt: "2026-10-19" }),
    record({ platform: "jobkorea", appliedAt: "2026-10-20" }),
    record({ platform: "wanted", appliedAt: undefined, sourceCreatedAt: "2026-10-19T12:00:00Z" }),
    record({ platform: "manual", appliedAt: "2026-09-14" }),
    record({ platform: "saramin", appliedAt: "2025-10-20" }),
    record({ platform: "jobkorea", status: "pending_confirmation" }),
    record({ platform: "saramin", status: "cancelled" }),
    record({ platform: "wanted", status: "unknown" })
  ].map((item, index) => ({ ...item, id: `analytics-${index}`, sourceApplicationId: `analytics-${index}`, companyName: `통계 예시 ${index}`, normalizedCompanyName: `통계예시${index}` }))
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: samples } })
  await expect(ui.locator(".summary-total .stat-number")).toHaveText("6건")
  await expect(ui.locator(".source-donut")).toHaveAccessibleName(/전체 지원 6건.*사람인 3건 50%.*원티드 1건 16.7%/)
  const initialUrl = ui.url()
  await expect(ui.getByRole("heading", { name: "지원 캘린더", exact: true })).toBeVisible()
  await expect(ui.locator(".calendar-panel .analytics-heading p")).toHaveText("전체 · 이달 지원 3건")
  await expect(ui.locator(".source-chart-legend i")).toHaveCount(0)
  await expect(ui.locator(".source-chart-legend img")).toHaveCount(3)
  await expect(ui.getByText("전체 지원 경로별 비율", { exact: true })).toHaveCount(0)
  await expect(ui.getByText("전체 선택됨", { exact: true })).toHaveCount(0)
  await expect(ui.getByText("지원 흐름과 같은 기간", { exact: true })).toHaveCount(0)
  await expect(ui.getByText("지원 완료 기준", { exact: true })).toHaveCount(0)
  await expect(ui.getByRole("button", { name: "월요일 지원 2건, 기간 내 66.7%", exact: true })).toBeVisible()
  const monday = ui.getByRole("button", { name: "2026-10-19 지원 2건", exact: true })
  await monday.click()
  await expect(ui.locator(".calendar-records li")).toHaveCount(2)
  await expect(ui.locator(".calendar-records")).toContainText("통계 예시 0")
  await expect(ui.locator(".calendar-records")).toContainText("통계 예시 1")
  const saramin = ui.getByRole("button", { name: "사람인 통계 보기", exact: true })
  await saramin.click()
  await expect(ui).toHaveURL(initialUrl)
  await expect(saramin).toHaveAttribute("aria-pressed", "true")
  await expect(ui.locator(".summary-total .stat-number")).toHaveText("3건")
  await expect(ui.locator(".calendar-panel .analytics-heading p")).toHaveText("사람인 · 이달 지원 2건")
  await expect(ui.getByRole("button", { name: "월요일 지원 2건, 기간 내 100%", exact: true })).toBeVisible()
  const tuesday = ui.getByRole("button", { name: "2026-10-20 지원 0건", exact: true })
  await tuesday.click()
  await expect(ui.locator(".calendar-empty")).toHaveText("이날의 지원 기록이 없습니다.")
  await ui.keyboard.press("ArrowLeft")
  await expect(monday).toBeFocused()
  await expect(ui.locator(".calendar-records li")).toHaveCount(2)
  await ui.screenshot({ path: "docs/screenshots/dashboard-filter-saramin.png", fullPage: true })
  await ui.getByRole("button", { name: "이전 달", exact: true }).click()
  await expect(ui.locator(".calendar-month")).toHaveText("2026년 9월")
  await expect(saramin).toHaveAttribute("aria-pressed", "true")
  await expect(ui.locator(".calendar-panel .analytics-heading p")).toHaveText("사람인 · 이달 지원 0건")
  await saramin.click()
  await expect(ui.locator(".summary-total .stat-number")).toHaveText("6건")
  await expect(ui.locator(".calendar-panel .analytics-heading p")).toHaveText("전체 · 이달 지원 1건")
  await ui.getByRole("button", { name: "2026-09-14 지원 1건", exact: true }).click()
  await expect(ui.locator(".calendar-records")).toContainText("통계 예시 4")
  await ui.getByRole("button", { name: "원티드 통계 보기", exact: true }).click()
  await expect(ui.locator(".summary-total .stat-number")).toHaveText("1건")
  await expect(ui.locator(".calendar-undated")).toHaveText("지원 날짜 미확인 1건")
  await expect(ui.locator(".calendar-records li")).toHaveCount(0)
  await expect(ui.locator(".activity-fill")).toHaveCount(7)
  expect(await ui.locator(".activity-fill").evaluateAll(elements => elements.every(element => element.getBoundingClientRect().height === 0))).toBe(true)
  await ui.getByRole("button", { name: "오늘", exact: true }).click()
  await expect(ui.locator(".calendar-month")).toHaveText("2026년 10월")
  await ui.getByRole("button", { name: "전체 보기", exact: true }).click()
  await expect(ui.locator(".summary-total .stat-number")).toHaveText("6건")
  await expect(ui.getByRole("button", { name: "다음 달", exact: true })).toBeDisabled()
  await expect(ui.getByRole("button", { name: "2026-10-21 지원 0건", exact: true })).toBeDisabled()
  await expect(ui.locator("table, .table-tools, .platform-panels")).toHaveCount(0)
  await expect(ui.locator(".source-donut")).toBeVisible()
})

test("캘린더 고정 높이·목록 내부 스크롤·응원 배너 하단 정렬", async ({ ui }) => {
  await ui.clock.setFixedTime(new Date("2026-10-20T12:00:00+09:00"))
  const records = Array.from({ length: 46 }, (_, index) => record({ id: `scroll-${index}`, sourceApplicationId: `scroll-${index}`, companyName: `스크롤 검증 기업 ${String(index).padStart(2, "0")}`, jobTitle: "웹 서비스와 제품 경험을 개발하는 프론트엔드 엔지니어", appliedAt: index === 45 ? "2026-10-19" : "2026-10-20" }))
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records } })
  const calendar = ui.locator(".calendar-panel"), column = ui.locator(".dashboard-side-column"), chart = ui.locator(".weekday-panel"), banner = ui.locator(".encouragement-banner")
  await expect.poll(() => banner.locator("img").evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  const dimensions = async () => {
    const c = (await calendar.boundingBox())!, r = (await column.boundingBox())!, w = (await chart.boundingBox())!, b = (await banner.boundingBox())!
    expect(c.height).toBe(640)
    expect(r.height).toBe(c.height)
    expect(Math.abs(c.y - r.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(c.y + c.height - b.y - b.height)).toBeLessThanOrEqual(1)
    expect(w.height).toBe(360)
  }
  await dimensions()
  const list = ui.locator(".calendar-records")
  await ui.getByRole("button", { name: "2026-10-20 지원 45건", exact: true }).click()
  await expect(list.locator("li")).toHaveCount(45)
  expect(await list.evaluate(element => element.clientHeight)).toBeGreaterThanOrEqual(250)
  await list.scrollIntoViewIfNeeded()
  const pageY = await ui.evaluate(() => window.scrollY)
  await list.hover()
  await ui.mouse.wheel(0, 650)
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  expect(await ui.evaluate(() => window.scrollY)).toBe(pageY)
  await dimensions()
  await list.evaluate(element => { element.scrollTop = element.scrollHeight })
  await ui.mouse.wheel(0, 650)
  expect(await ui.evaluate(() => window.scrollY)).toBe(pageY)
  await ui.getByRole("button", { name: "2026-10-19 지원 1건", exact: true }).click()
  await expect(list.locator("li")).toHaveCount(1)
  expect(await list.evaluate(element => element.scrollTop)).toBe(0)
  await dimensions()
  await ui.getByRole("button", { name: "2026-10-20 지원 45건", exact: true }).click()
  await expect(list.locator("li")).toHaveCount(45)
  expect(await list.evaluate(element => element.scrollTop)).toBe(0)
  await dimensions()
  await ui.setViewportSize({ width: 390, height: 844 })
  expect((await calendar.boundingBox())!.height).toBe(640)
  expect(await ui.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(await list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  expect(await list.evaluate(element => element.clientHeight)).toBeGreaterThanOrEqual(240)
  await ui.screenshot({ path: "docs/screenshots/calendar-scroll-mobile.png", fullPage: true })
})

test("캘린더는 4·5·6주 월과 빈 마지막 주에도 동일한 크기를 유지", async ({ ui }) => {
  await ui.clock.setFixedTime(new Date("2021-05-31T12:00:00+09:00"))
  const early = record({ id: "early-week", sourceApplicationId: "early-week", appliedAt: "2021-05-01" })
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [early, record({ platform: "jobkorea", sourceApplicationId: "outside-month", appliedAt: "2021-04-01" })] } })
  await ui.getByRole("button", { name: "오늘", exact: true }).click()
  await ui.evaluate(() => document.fonts.ready.then(() => undefined))
  const geometry = async () => {
    const panel = (await ui.locator(".calendar-panel").boundingBox())!
    const grid = (await ui.locator(".calendar-days").boundingBox())!
    const details = (await ui.locator(".calendar-selection").boundingBox())!
    return { panelHeight: panel.height, gridHeight: grid.height, detailsTop: details.y - panel.y, detailsHeight: details.height }
  }
  const original = await geometry()
  const late = record({ id: "last-week", sourceApplicationId: "last-week", appliedAt: "2021-05-31" })
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [late] } })
  await expect(ui.getByRole("button", { name: "2021-05-31 지원 1건", exact: true })).toBeVisible()
  expect(await geometry()).toEqual(original)
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await ui.setViewportSize(viewport)
    await ui.getByRole("button", { name: "오늘", exact: true }).click()
    const expected = await geometry()
    expect(expected.panelHeight).toBe(640)
    await ui.getByRole("button", { name: "잡코리아 통계 보기", exact: true }).click()
    await expect(ui.locator(".calendar-day[data-count='true']")).toHaveCount(0)
    expect(await geometry()).toEqual(expected)
    for (const month of ["05", "04", "03", "02"]) {
      await expect(ui.locator(".calendar-month")).toHaveText(`2021년 ${Number(month)}월`)
      await expect(ui.locator(".calendar-days > *")).toHaveCount(42)
      expect(await geometry()).toEqual(expected)
      if (month !== "02") await ui.getByRole("button", { name: "이전 달", exact: true }).click()
    }
    await expect(ui.locator(".calendar-day")).toHaveCount(28)
    await ui.getByRole("button", { name: "전체 보기", exact: true }).click()
    expect(await geometry()).toEqual(expected)
  }
})

test("설정 데이터 초기화: 취소·수집 중지·권한·지연 요청 차단·다시 가져오기", async ({ ui, context, extensionId }) => {
  test.setTimeout(60000)
  const initial = await rpc<Snapshot>(ui, { type: "snapshot" })
  const settings = { ...initial.settings, theme: "dark" as const, historyAutoCollect: true }
  await rpc(ui, { type: "settings", settings })
  const records = [record({ sourceApplicationId: "reset-1" }), record({ platform: "jobkorea", sourceApplicationId: "reset-2" }), record({ platform: "manual", sourceApplicationId: "reset-3" })]
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records } })
  const url = "https://www.jobkorea.co.kr/User/ApplyMng?Page=1"
  await context.route(url, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<main aria-busy="true"><h1>합성 지원 현황 로딩 중</h1></main>' }))
  const history = await context.newPage(); await history.goto(url)
  await expect.poll(async () => { try { return (await pageMessage(ui, url, "GET_PAGE")).ok } catch { return false } }).toBe(true)
  const cdp = await context.newCDPSession(history)
  const worlds: { id: number; name: string; origin: string }[] = []
  cdp.on("Runtime.executionContextCreated", event => worlds.push(event.context))
  await cdp.send("Runtime.enable")
  const world = () => worlds.find(value => value.name.includes(extensionId) || value.origin === `chrome-extension://${extensionId}`)
  await expect.poll(() => world()?.id).toBeTruthy()
  // A site content script cannot request destructive record management.
  const denied = await cdp.send("Runtime.evaluate", { contextId: world()!.id, expression: 'chrome.runtime.sendMessage({type:"reset_data"})', awaitPromise: true, returnByValue: true })
  expect(denied.result.value.ok).toBe(false)
  expect(await count(ui)).toBe(3)
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), url)
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  const run = (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun!
  expect(run.status).toBe("running")
  await ui.evaluate(() => chrome.storage.local.set({ historyCompletions: { saramin: new Date().toISOString() }, submissionAttempts: [{ id: crypto.randomUUID(), platform: "jobkorea", tabId: 99999, frameId: 0, sourceJobId: "100", stage: "started", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], submissionContexts: [], submissionHandoffs: [], dismissedHistoryRun: "old" }))
  const backup = await rpc(ui, { type: "backup" })
  await ui.getByRole("button", { name: "설정", exact: true }).click()
  const open = ui.getByRole("button", { name: "데이터 초기화", exact: true })
  await open.click()
  const dialog = ui.getByRole("dialog", { name: "지원 데이터를 초기화할까요?" })
  await expect(dialog).toContainText("3건")
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused()
  await dialog.getByRole("button", { name: "취소", exact: true }).click()
  expect(await count(ui)).toBe(3)
  await open.click()
  await ui.screenshot({ path: "docs/screenshots/reset-data-confirmation.png", fullPage: true })
  await dialog.getByRole("button", { name: "지원 데이터 삭제", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(ui.getByText("지원 데이터를 초기화했습니다.", { exact: true })).toBeVisible()
  const cleared = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(cleared.records).toEqual([])
  expect(cleared.settings).toEqual(settings)
  expect(cleared.reports).toEqual({})
  expect(cleared.historyCompletions).toEqual({})
  expect(cleared.submissionAttempts).toEqual([])
  expect(cleared.historyRun).toBeUndefined()
  expect(cleared.dataGeneration).toBeTruthy()
  const stale = { type: "collect", platform: "jobkorea", automatic: false, result: { code: "ok", message: "stale", skipped: 0, hasNextPage: false, scope: "stale", records: [records[1]] } }
  const rejected = await cdp.send("Runtime.evaluate", { contextId: world()!.id, expression: `chrome.runtime.sendMessage(${JSON.stringify(stale)})`, awaitPromise: true, returnByValue: true })
  expect(rejected.result.value.ok).toBe(false)
  expect(rejected.result.value.error).toContain("초기화")
  const stopped = await ui.evaluate(async ({ tabId, runId }) => chrome.tabs.sendMessage(tabId, { type: "SYNC_PAGE", runId }), { tabId: tabs[0]!.id!, runId: run.id })
  expect(stopped.ok).toBe(false)
  await history.evaluate(html => { document.body.innerHTML = html }, fixture("semantic-history.html"))
  await pageMessage(ui, url, "GET_PAGE")
  expect(await count(ui)).toBe(0)
  await sync(ui, history)
  await expect.poll(() => count(ui)).toBe(2)
  await rpc(ui, { type: "restore", backup })
  expect(await count(ui)).toBe(5)
  await ui.getByRole("button", { name: "대시보드", exact: true }).click()
  await expect(ui.getByRole("heading", { name: "지원 기록 업데이트", exact: true })).toBeVisible()
  await expect(ui.locator(".source-imports button")).toHaveCount(4)
  await expect(ui.locator(".source-imports button:disabled")).toHaveCount(0)
})

test("대시보드 사이트 심벌과 가져오기 버튼: 직접 수집 시작·중복 실행 차단·오류·수집 설정", async ({ ui, context, extensionId }) => {
  await context.route(/^https:\/\/(?:www\.(?:saramin|jobkorea|wanted)\.co\.kr|profile\.rememberapp\.co\.kr)\//, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<main aria-busy="true"><h1>합성 지원 목록 로딩 중</h1></main>' }))
  // Attach routing before the initial navigation of a Chrome-created tab.
  await ui.evaluate(() => {
    const create = chrome.tabs.create.bind(chrome.tabs)
    chrome.tabs.create = async properties => {
      if (properties.url?.startsWith("chrome-extension://")) return create(properties)
      const tab = await create({ ...properties, url: "about:blank" })
      await new Promise<void>(resolve => {
        const updated = (id: number, change: chrome.tabs.OnUpdatedInfo, current: chrome.tabs.Tab) => {
          if (id === tab.id && change.status === "complete" && current.url === properties.url) { chrome.tabs.onUpdated.removeListener(updated); resolve() }
        }
        chrome.tabs.onUpdated.addListener(updated)
      })
      return chrome.tabs.get(tab.id!)
    }
  })
  const panel = ui.getByRole("region", { name: "지원 기록 업데이트", exact: true })
  await expect(panel.getByRole("link")).toHaveCount(0)
  await expect(panel.locator(".source-imports .platform-symbol")).toHaveCount(4)
  await expect.poll(() => panel.locator(".source-imports img").evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
  const initialUrl = ui.url()
  const sites = [
    { platform: "saramin", label: "사람인", url: "https://www.saramin.co.kr/zf_user/persons/apply-status-list" },
    { platform: "jobkorea", label: "잡코리아", url: "https://www.jobkorea.co.kr/User/ApplyMng?Page=1" },
    { platform: "wanted", label: "원티드", url: "https://www.wanted.co.kr/status/applications/applied?q&start_date=&end_date=&page=1&offset=0&limit=10" },
    { platform: "remember", label: "리멤버", url: "https://profile.rememberapp.co.kr/applies" }
  ] as const
  for (const site of sites) {
    const created = context.waitForEvent("page")
    const button = panel.getByRole("button", { name: `${site.label} 지원 기록 가져오기`, exact: true })
    await button.click()
    const history = await created
    await history.goto(site.url)
    await expect(history).toHaveURL(site.url)
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun).toMatchObject({ status: "running", platform: site.platform })
    await expect(button).toHaveText("가져오는 중…")
    await expect(panel.locator(".source-imports button:disabled")).toHaveCount(4)
    await expect(ui).toHaveURL(initialUrl)
    await rpc(ui, { type: "history_run", operation: "stop" })
    await expect(panel.locator(".source-imports button:disabled")).toHaveCount(0)
    await history.close()
  }
  await ui.evaluate(() => {
    const create = chrome.tabs.create
    ;(window as typeof window & { restoreCreate?: () => void }).restoreCreate = () => { chrome.tabs.create = create }
    chrome.tabs.create = (async () => { throw new Error("합성 탭 열기 오류") }) as typeof chrome.tabs.create
  })
  await panel.getByRole("button", { name: "사람인 지원 기록 가져오기", exact: true }).click()
  await expect(panel.getByRole("alert")).toHaveText("합성 탭 열기 오류")
  await expect(panel.locator(".source-imports button:disabled")).toHaveCount(0)
  await ui.evaluate(() => (window as typeof window & { restoreCreate?: () => void }).restoreCreate?.())
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, consent: { ...snapshot.settings.consent, wanted: false } } })
  const created = context.waitForEvent("page")
  await panel.getByRole("button", { name: "원티드 수집 설정 열기", exact: true }).click()
  const settings = await created
  await expect(settings).toHaveURL(`chrome-extension://${extensionId}/options.html#settings`)
  await expect(ui).toHaveURL(initialUrl)
})

test("실제 지원 경로만 표시·직접 추가 사이트 선택·통계와 캘린더 필터·백업 복원", async ({ ui }) => {
  await ui.clock.setFixedTime(new Date("2026-10-20T12:00:00+09:00"))
  const panel = ui.getByRole("region", { name: "지원 경로별 비율", exact: true })
  await expect(panel.locator(".source-chart-legend button")).toHaveCount(0)
  await expect(panel).toContainText("지원 기록을 추가하면 경로별 비율이 표시됩니다.")
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [record({ sourceApplicationId: "present" }), record({ platform: "wanted", status: "pending_confirmation", sourceApplicationId: "not-completed" })] } })
  await expect(panel.locator(".source-chart-legend button")).toHaveCount(1)
  await expect(panel.getByRole("button", { name: "원티드 통계 보기", exact: true })).toHaveCount(0)
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  for (const [index, site] of ["리멤버", "점핏", "원티드"].entries()) {
    await ui.getByRole("button", { name: "+ 직접 추가", exact: true }).click()
    const dialog = ui.getByRole("dialog", { name: "지원 기록 직접 추가", exact: true })
    await expect(dialog.getByRole("radio")).toHaveCount(19)
    await dialog.getByLabel("기업명", { exact: true }).fill(`선택 경로 기업 ${index}`)
    await dialog.getByLabel("지원 직무", { exact: true }).fill("프론트엔드 개발자")
    await dialog.getByLabel("지원 날짜", { exact: true }).fill("2026-10-19")
    await dialog.getByRole("button", { name: "메모 더 보기", exact: true }).click()
  await dialog.getByRole("radio", { name: site, exact: true }).check()
    await expect(dialog.locator('input[type="radio"]:checked')).toHaveCount(1)
    await expect(dialog.getByLabel("경로 이름", { exact: true })).toHaveCount(0)
    if (site === "리멤버") await dialog.screenshot({ path: "docs/screenshots/manual-source-picker.png" })
    await dialog.getByRole("button", { name: "기록 추가", exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  await ui.getByRole("button", { name: "대시보드", exact: true }).click()
  await expect(panel.locator(".source-chart-legend button")).toHaveCount(4)
  await expect(panel.locator("[aria-disabled=true], [data-upcoming]")).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "잡플래닛 통계 보기", exact: true })).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "리멤버 통계 보기", exact: true })).toHaveText("리멤버1건25%")
  await panel.getByRole("button", { name: "리멤버 통계 보기", exact: true }).click()
  await expect(ui.locator(".summary-total .stat-number")).toHaveText("1건")
  await expect(ui.locator(".calendar-panel .analytics-heading p")).toHaveText("리멤버 · 이달 지원 1건")
  await ui.getByRole("button", { name: "2026-10-19 지원 1건", exact: true }).click()
  await expect(ui.locator(".calendar-records")).toContainText("선택 경로 기업 0")
  await expect(ui.getByRole("button", { name: "월요일 지원 1건, 기간 내 100%", exact: true })).toBeVisible()
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  const remember = snapshot.records.find(record => record.sourceLabel === "리멤버")!
  expect(remember).toMatchObject({ platform: "manual", evidence: "manual" })
  const wanted = snapshot.records.find(record => record.companyName === "선택 경로 기업 2")!
  expect(wanted).toMatchObject({ platform: "wanted", evidence: "manual" })
  const backup = await rpc(ui, { type: "backup" })
  await rpc(ui, { type: "remove", id: remember.id })
  await expect(panel.getByRole("button", { name: "리멤버 통계 보기", exact: true })).toHaveCount(0)
  await expect(ui.locator(".summary-total .stat-top")).toHaveText("전체 지원 수")
  await rpc(ui, { type: "restore", backup })
  await expect(panel.getByRole("button", { name: "리멤버 통계 보기", exact: true })).toBeEnabled()
  await ui.setViewportSize({ width: 390, height: 844 })
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await ui.getByRole("button", { name: "+ 직접 추가", exact: true }).click()
  const dialog = ui.getByRole("dialog", { name: "지원 기록 직접 추가", exact: true })
  await dialog.getByRole("radio", { name: "게임잡", exact: true }).check()
  expect(await ui.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(342)
  await dialog.screenshot({ path: "docs/screenshots/manual-source-picker-mobile.png" })
  await dialog.getByRole("radio", { name: "기업 홈페이지 · 기타", exact: true }).check()
  await expect(dialog.getByLabel("경로 이름", { exact: true })).toHaveValue("기업 홈페이지")
  await dialog.getByRole("button", { name: "취소", exact: true }).click()
})

test("대시보드 요약 재구성·기록 표 브랜드 라벨·라이트 다크 모바일", async ({ ui }) => {
  await ui.clock.setFixedTime(new Date("2026-10-20T12:00:00+09:00"))
  const sources = ["saramin", "jobkorea", "wanted", "manual"] as const
  const dates = ["2026-10-19", "2026-10-16", "2026-10-15", "2026-10-12", "2026-10-09", "2026-10-08", "2026-10-02", "2026-09-28"]
  const records = Array.from({ length: 8 }, (_, index) => record({ platform: sources[index % 4], sourceApplicationId: `design-${index}`, companyName: `가상 기업 ${index % 6 + 1}`, jobTitle: index % 2 ? "프론트엔드 개발자" : "웹 서비스 개발자", appliedAt: dates[index], readStatus: index < 3 ? "read" : index < 6 ? "unread" : "unknown" }))
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records } })
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, theme: "light" } })
  await ui.evaluate(() => document.fonts.ready)
  expect(await ui.evaluate(() => document.fonts.check('14px "Pretendard"', "지원 기록"))).toBe(true)
  expect(await ui.locator(".dashboard-summary").evaluate(element => getComputedStyle(element).fontFamily)).toContain("Pretendard")
  expect(await ui.locator(".dashboard-hero-headline").evaluate(element => getComputedStyle(element).fontFamily)).not.toContain("Pretendard")
  await expect(ui.locator(".summary-total .stat-number")).toHaveText("8건")
  const summaryBox = (await ui.locator(".dashboard-summary").boundingBox())!
  const importsBox = (await ui.locator(".dashboard-imports").boundingBox())!
  expect(importsBox.x).toBeGreaterThanOrEqual(summaryBox.x + summaryBox.width)
  expect(importsBox.y).toBe(summaryBox.y)
  expect(importsBox.height).toBe(summaryBox.height)
  const sourceBox = (await ui.locator(".source-panel").boundingBox())!
  const donutBox = (await ui.locator(".source-donut").boundingBox())!
  expect(Math.abs(donutBox.x - sourceBox.x - 25)).toBeLessThanOrEqual(1)
  await ui.locator(".dashboard-overview-top").screenshot({ path: "docs/screenshots/dashboard-update-layout.png" })
  await expect(ui.locator(".summary-companies dd")).toHaveText("6곳")
  await expect(ui.getByRole("button", { name: "지원 기록 보기", exact: true })).toHaveCount(0)
  await expect(ui.locator("table, .table-tools, .platform-panels")).toHaveCount(0)
  await ui.getByRole("button", { name: "2026-10-19 지원 1건", exact: true }).click()
  await ui.screenshot({ path: "docs/screenshots/dashboard-refined-light.png", fullPage: true })
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await expect(ui.locator(".dashboard-summary, .dashboard-analytics")).toHaveCount(0)
  await expect(ui.locator("tbody tr")).toHaveCount(8)
  await expect(ui.locator("tbody .company-avatar,tbody td:first-child img")).toHaveCount(0)
  expect(await ui.locator("tbody .status").evaluateAll(elements => elements.every(element => ["none", "normal"].includes(getComputedStyle(element, "::before").content)))).toBe(true)
  const colors = await ui.locator("tbody .platform-tag:not(.manual)").evaluateAll(elements => elements.map(element => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color })))
  expect(new Set(colors.map(value => value.background)).size).toBe(3)
  expect(colors.every(value => value.color === "rgb(255, 255, 255)")).toBe(true)
  await ui.screenshot({ path: "docs/screenshots/records-separated-light.png", fullPage: true })
  await ui.getByRole("button", { name: "대시보드", exact: true }).click()
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, theme: "dark" } })
  await expect(ui.locator("html")).toHaveAttribute("data-theme", "dark")
  expect(await ui.locator(".analytics-panel").first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(24, 24, 27)")
  await ui.getByRole("button", { name: "2026-10-19 지원 1건", exact: true }).click()
  await ui.screenshot({ path: "docs/screenshots/dashboard-refined-dark.png", fullPage: true })
  await ui.setViewportSize({ width: 390, height: 844 })
  expect(await ui.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await ui.screenshot({ path: "docs/screenshots/dashboard-refined-mobile.png", fullPage: true })
  await ui.context().setOffline(true)
  await ui.reload()
  await ui.evaluate(() => document.fonts.ready)
  expect(await ui.evaluate(() => Array.from(document.fonts).some(face => face.family === "Pretendard" && face.status === "loaded"))).toBe(true)
  await expect(ui.locator(".summary-total .stat-number")).toHaveText("8건")
})

for (const platform of ["saramin", "jobkorea"] as const) {
for (const loginMode of ["navigation", "same-document"] as const) {
  test(`${platform} 로그인 후 자동 수집이 있어도 전체 가져오기 다시 시도를 유지한다: ${loginMode}`, async ({ ui, context }) => {
    await enableHistoryAuto(ui)
    const initial = platform === "saramin" ? "https://www.saramin.co.kr/zf_user/persons/apply-status-list" : "https://www.jobkorea.co.kr/User/ApplyMng?Page=1"
    let loggedIn = false
    const visited: number[] = []
    await context.route(`https://www.${platform}.co.kr/**`, route => {
      const url = new URL(route.request().url())
      const page = platform === "saramin" ? Number(url.pathname.match(/\/page\/(\d+)/)?.[1] || 1) : Number(url.searchParams.get("Page") || 1)
      if (loggedIn) visited.push(page)
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: loggedIn ? inspectedHistory(platform, page) : "<main><p>로그인이 필요한 페이지 입니다.</p></main>" })
    })
    const history = await context.newPage(); await history.goto(initial)
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).reports[platform]?.code).toBe("login_required")
    const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), initial)
    await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun).toMatchObject({ status: "error", issue: "login_required", pages: 0 })
    await expect(ui.locator(".history-run-toast")).toContainText(`${platform === "saramin" ? "사람인" : "잡코리아"} · 로그인이 필요해요`)
    const failed = (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun!
    loggedIn = true
    if (loginMode === "navigation") await history.goto(initial)
    else await history.evaluate(html => { document.body.innerHTML = html }, inspectedHistory(platform))
    await expect.poll(() => count(ui)).toBe(20)
    const indicator = history.locator("todaystart-collection")
    await expect(indicator.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible()
    await indicator.getByRole("button", { name: "다시 시도", exact: true }).click()
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 25000 }).toBe("completed")
    const final = await rpc<Snapshot>(ui, { type: "snapshot" })
    expect(final.historyRun?.id).not.toBe(failed.id)
    const total = platform === "saramin" ? 32 : 21
    expect(final.historyRun).toMatchObject({ pages: 2, processed: total, skipped: 0 })
    expect(final.records).toHaveLength(total)
    expect(final.historyCompletions?.[platform]).toBeTruthy()
    expect(visited).toEqual(loginMode === "navigation" ? [1, 2] : [2])
    await expect(indicator).toContainText("지원 기록 수집 완료")
  })
}
}

test("사람인 전체 가져오기 실패 뒤 현재 목록을 직접 가져오면 재시도 범위를 현재 페이지로 유지", async ({ ui, context }) => {
  await enableHistoryAuto(ui)
  const initial = "https://www.saramin.co.kr/zf_user/persons/apply-status-list"
  await context.route(initial, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: "<main><p>로그인이 필요한 페이지 입니다.</p></main>" }))
  const history = await context.newPage(); await history.goto(initial)
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).reports.saramin?.code).toBe("login_required")
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), initial)
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status).toBe("error")
  const failed = (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun!
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, historyAutoCollect: false } })
  await sync(ui, history)
  const indicator = history.locator("todaystart-collection")
  await expect(indicator).toContainText("지원 목록 확인 필요")
  await history.evaluate(html => { document.body.innerHTML = html }, inspectedHistory("saramin"))
  await indicator.getByRole("button", { name: "다시 시도", exact: true }).click()
  await expect.poll(() => count(ui)).toBe(20)
  await expect(indicator).toContainText("현재 목록 수집 완료")
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun).toMatchObject({ id: failed.id, status: "error", pages: 0 })
  await expect(history).toHaveURL(initial)
})

for (const platform of ["jobkorea", "saramin"] as const) {
for (const afterLoginPage of [1, 2]) {
  test(`${platform} 로그인 실패 후 다시 시도: ${afterLoginPage}페이지에서 전체 가져오기 재시작`, async ({ ui, context }) => {
    const initial = platform === "jobkorea" ? "https://www.jobkorea.co.kr/User/ApplyMng?Page=1" : "https://www.saramin.co.kr/zf_user/persons/apply-status-list"
    const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    await rpc(ui, { type: "settings", settings: { ...snapshot.settings, autoRecord: false } })
    let loggedIn = false
    const visited: number[] = []
    await context.route(`https://www.${platform}.co.kr/**`, route => {
      const url = new URL(route.request().url())
      const page = platform === "jobkorea" ? Number(url.searchParams.get("Page") || 1) : Number(url.pathname.match(/\/page\/(\d+)/)?.[1] || 1)
      if (loggedIn) visited.push(page)
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: loggedIn ? inspectedHistory(platform, page) : "<main><p>로그인이 필요한 페이지 입니다.</p></main>" })
    })
    const history = await context.newPage(); await history.goto(initial)
    const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), initial)
    await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun).toMatchObject({ status: "error", pages: 0 })
    const failed = (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun!
    expect(failed.message).toContain("로그인")
    expect(await count(ui)).toBe(0)

    loggedIn = true
    await history.goto(platform === "jobkorea" ? initial.replace("Page=1", `Page=${afterLoginPage}`) : initial + (afterLoginPage === 2 ? "/page/2" : ""))
    const indicator = history.locator("todaystart-collection")
    await expect(indicator).toContainText("지원 기록 확인 필요")
    if (afterLoginPage === 2) {
      await rpc(ui, { type: "settings", settings: { ...snapshot.settings, autoRecord: false, consent: { ...snapshot.settings.consent, [platform]: false } } })
      await indicator.getByRole("button", { name: "다시 시도", exact: true }).click()
      await expect(indicator).toContainText("수집 설정을 먼저 켜")
      expect((await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.id).toBe(failed.id)
      await rpc(ui, { type: "settings", settings: { ...snapshot.settings, autoRecord: false } })
    }
    await indicator.getByRole("button", { name: "다시 시도", exact: true }).click()
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 25000 }).toBe("completed")
    const final = await rpc<Snapshot>(ui, { type: "snapshot" })
    expect(final.historyRun?.id).not.toBe(failed.id)
    const total = platform === "jobkorea" ? 21 : 32
    expect(final.historyRun).toMatchObject({ pages: 2, processed: total, inserted: total, skipped: 0 })
    expect(final.records).toHaveLength(total)
    expect(final.historyCompletions?.[platform]).toBeTruthy()
    expect(visited).toEqual(afterLoginPage === 1 ? [1, 2] : [2, 1, 2])
    await expect(indicator).toContainText("지원 기록 수집 완료")
  })
}
}

test("잡코리아 현재 목록 수집 실패의 다시 시도는 현재 페이지만 저장", async ({ ui, context }) => {
  const initial = "https://www.jobkorea.co.kr/User/ApplyMng?Page=1"
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, autoRecord: false } })
  await context.route(initial, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: "<main><p>로그인이 필요한 페이지 입니다.</p></main>" }))
  const history = await context.newPage(); await history.goto(initial)
  await sync(ui, history)
  const indicator = history.locator("todaystart-collection")
  await expect(indicator.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible()
  await history.evaluate(html => { document.body.innerHTML = html }, inspectedHistory("jobkorea"))
  await indicator.getByRole("button", { name: "다시 시도", exact: true }).click()
  await expect.poll(() => count(ui)).toBe(20)
  await expect(indicator).toContainText("현재 목록 수집 완료")
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun).toBeUndefined()
  await expect(history).toHaveURL(initial)
})

test("다른 탭에서는 실패한 전체 가져오기를 재시도할 수 없다", async ({ ui, context, extensionId }) => {
  const initial = "https://www.jobkorea.co.kr/User/ApplyMng?Page=1"
  await context.route("https://www.jobkorea.co.kr/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: "<main><p>로그인이 필요한 페이지 입니다.</p></main>" }))
  const history = await context.newPage(); await history.goto(initial)
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), initial)
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status).toBe("error")
  const failed = (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun!
  const other = await context.newPage(); await other.goto(initial)
  const cdp = await context.newCDPSession(other), worlds: { id: number; name: string; origin: string }[] = []
  cdp.on("Runtime.executionContextCreated", event => worlds.push(event.context))
  await cdp.send("Runtime.enable")
  const world = () => worlds.find(value => value.name.includes(extensionId) || value.origin === `chrome-extension://${extensionId}`)
  await expect.poll(() => world()?.id).toBeTruthy()
  for (const request of [
    { type: "history_run", operation: "retry" },
    { type: "history_run", operation: "retry", tabId: failed.tabId },
    { type: "history_run", operation: "start", tabId: failed.tabId }
  ]) {
    const denied = await cdp.send("Runtime.evaluate", { contextId: world()!.id, expression: `chrome.runtime.sendMessage(${JSON.stringify(request)})`, awaitPromise: true, returnByValue: true })
    expect(denied.result.value.ok).toBe(false)
  }
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun).toMatchObject({ id: failed.id, status: "error", pages: 0 })
  await cdp.detach()
})

for (const platform of ["jobkorea", "saramin"] as const) {
  test(`공유 조사 구조 ${platform}: 기본 URL → 필터 포함 링크 → 마지막 페이지 전체 수집`, async ({ ui, context }) => {
    test.setTimeout(90000)
    const initial = platform === "jobkorea" ? "https://www.jobkorea.co.kr/User/ApplyMng?Page=1#" : "https://www.saramin.co.kr/zf_user/persons/apply-status-list"
    const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    await rpc(ui, { type: "settings", settings: { ...snapshot.settings, autoRecord: false } })
    if (platform === "jobkorea") {
      const records = Array.from({ length: 8 }, (_, index) => {
        const id = 100 + index
        return record({ platform, companyName: `가상기업 ${id}`, normalizedCompanyName: `가상기업${id}`, jobTitle: `개발자 ${id} (~10/30)`, appliedAt: "2026-10-01", sourceJobId: String(90000000 + id), jobUrl: `https://www.jobkorea.co.kr/Recruit/GI_Read/${90000000 + id}` })
      })
      await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records } })
    }
    const visited: string[] = []
    await context.route(`https://www.${platform}.co.kr/**`, route => {
      const url = new URL(route.request().url())
      const page = platform === "jobkorea" ? Number(url.searchParams.get("Page") || 1) : Number(url.pathname.match(/\/page\/(\d+)/)?.[1] || 1)
      visited.push(url.href)
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: inspectedHistory(platform, page) })
    })
    const history = await context.newPage()
    await history.goto(initial)
    await expect.poll(async () => {
      try { return (await pageMessage(ui, initial.split("#")[0]!, "GET_PAGE")).ok } catch { return false }
    }, { timeout: 15000 }).toBe(true)
    const tabs = await ui.evaluate(async address => (await chrome.tabs.query({})).filter(tab => tab.url?.split("#")[0] === address), initial.split("#")[0]!)
    await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 60000 }).toBe("completed")
    const final = await rpc<Snapshot>(ui, { type: "snapshot" })
    const total = platform === "jobkorea" ? 21 : 32
    expect(final.records).toHaveLength(total)
    expect(final.historyRun).toMatchObject({ pages: 2, processed: total, skipped: 0, inserted: platform === "jobkorea" ? 13 : 32, updated: platform === "jobkorea" ? 8 : 0 })
    expect(visited).toHaveLength(2)
    expect(new URL(visited[1]!).searchParams.get(platform === "jobkorea" ? "From_Dt" : "start_date")).toBe(platform === "jobkorea" ? "2026-07-21" : "2026-09-19")
    expect(final.records.every(value => value.appliedAt === "2026-10-01" && !!value.sourceApplicationId && value.status === "applied")).toBe(true)
    await expect(history.locator("todaystart-collection")).toContainText("지원 기록 수집 완료")
  })
}

for (const apiAvailable of [true, false]) {
  test(`원티드 실제 조사 행: API ${apiAvailable ? "보강 및 열람 갱신" : "실패 시 DOM 수집"}, 대시보드 집계·문장 줄바꿈`, async ({ ui, context, extensionId }) => {
    await enableHistoryAuto(ui)
    test.setTimeout(90000)
    const url = "https://www.wanted.co.kr/status/applications/applied?page=1&offset=0&limit=10"
    let readAll = false
    await context.route("https://www.wanted.co.kr/**", route => {
      if (new URL(route.request().url()).pathname === "/api/v1/applications") return route.fulfill({ status: apiAvailable ? 200 : 401, contentType: "application/json", body: JSON.stringify(wantedInspectedResponse(1, readAll)) })
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: wantedInspectedHistory() })
    })
    await rpc(ui, { type: "manual_create", application: { platform: "manual", companyName: "직접 지원 기업", jobTitle: "개발자", appliedAt: "2026-10-19", status: "applied" } })
    const history = await context.newPage(); await history.goto(url)
    await expect.poll(() => count(ui), { timeout: 15000 }).toBe(3)
    const stat = (name: string) => ui.locator(".stat-card").filter({ has: ui.locator(".stat-top", { hasText: new RegExp(`^${name}$`) }) }).locator(".stat-number")
    await expect(stat("열람")).toHaveText("2건")
    await expect(stat("미열람")).toHaveText("0건")
    await expect(ui.getByText("열람 여부를 알 수 없는 기록 1건")).toBeVisible()
    let snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    expect(snapshot.records.filter(record => record.platform === "wanted").every(record => !record.appliedAt && record.sourceCreatedAt && record.sourceStatus === "불합격")).toBe(true)
    for (const value of ["PRIVATE_RESUME", "PRIVATE_USER", "PRIVATE_EMAIL"]) expect(JSON.stringify(snapshot.records)).not.toContain(value)
    await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
    await expect(ui.getByText("2026.09.11", { exact: true })).toBeVisible()
    await expect(ui.getByRole("columnheader", { name: "열람 여부" })).toBeVisible()
    const rejectedRows = ui.locator("tbody tr").filter({ has: ui.locator(".status", { hasText: "불합격" }) })
    await expect(rejectedRows.locator("td:nth-child(6)")).toHaveText(["열람", "열람"])
    if (apiAvailable) {
      readAll = true
      await history.evaluate(async () => {
        await fetch("/api/v1/applications?user_id=100&page=1&offset=0&limit=10&refresh=2")
        document.querySelector("section")!.setAttribute("data-refreshed", "true")
      })
      await ui.getByRole("button", { name: "대시보드", exact: true }).click()
      await expect(stat("열람")).toHaveText("2건")
      await expect(stat("미열람")).toHaveText("0건")
      expect(await count(ui)).toBe(3)
    }
    const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), url)
    await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 15000 }).toBe("completed")
    snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    expect(snapshot.historyRun).toMatchObject({ pages: 1, processed: 2, inserted: 0, updated: 2, skipped: 0 })
    expect(snapshot.records).toHaveLength(3)
    if (apiAvailable) {
      await ui.screenshot({ path: "docs/screenshots/wanted-dashboard-light.png", fullPage: true })
      await rpc(ui, { type: "settings", settings: { ...snapshot.settings, theme: "dark" } })
      await expect(ui.locator("html")).toHaveAttribute("data-theme", "dark")
      await ui.screenshot({ path: "docs/screenshots/wanted-dashboard-dark.png", fullPage: true })
    }
    // Controlled terminal state tests message presentation without waiting 45s.
    const message = "지원 목록을 확인하지 못했습니다. 로딩이 끝나지 않았습니다. 다시 시도해 주세요."
    await ui.evaluate(async ({ run, message }) => chrome.storage.session.set({ historyRun: { ...run, status: "error", message } }), { run: snapshot.historyRun!, message })
    const lines = "지원 목록을 확인하지 못했습니다.\n로딩이 끝나지 않았습니다.\n다시 시도해 주세요."
    await expect(ui.locator(".history-run-toast")).toContainText("원티드 · 가져오기를 마치지 못했어요")
    await expect(ui.locator(".history-run-toast p")).toContainText("원인을 확인하지 못했어요")
    await expect.poll(() => history.locator("todaystart-collection p").first().textContent()).toBe(lines)
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await history.bringToFront(); await popup.reload()
    await expect(popup.locator(".collection-progress")).toContainText("원티드 · 가져오기를 마치지 못했어요")
  })
}

test("원티드 실제 조사 구조의 다음 버튼으로 두 페이지 수집", async ({ ui, context }) => {
  await enableHistoryAuto(ui)
  test.setTimeout(90000)
  const url = "https://www.wanted.co.kr/status/applications/applied?page=1&offset=0&limit=10"
  await context.route("https://www.wanted.co.kr/**", route => {
    const request = new URL(route.request().url()), page = Number(request.searchParams.get("page") || 1)
    return route.fulfill({ contentType: request.pathname.startsWith("/api/") ? "application/json" : "text/html; charset=utf-8", body: request.pathname.startsWith("/api/") ? JSON.stringify(wantedInspectedResponse(page)) : wantedInspectedHistory(page, true, true) })
  })
  const history = await context.newPage(); await history.goto(url)
  await expect.poll(() => count(ui)).toBe(2)
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), url)
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 60000 }).toBe("completed")
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun).toMatchObject({ pages: 2, processed: 4, skipped: 0 })
  expect(await count(ui)).toBe(4)
})

test("최신 지원순은 날짜와 제출 시각 기준이고 상태 불명은 모아서 순차 처리한다", async ({ ui, extensionId, context }) => {
  await ui.clock.setFixedTime(new Date("2026-10-21T12:00:00+09:00"))
  const records = ["A", "B", "C"].map((name, index) => record({ sourceApplicationId: `order-${name}`, companyName: `${name} 기업`, appliedAt: "2026-10-21", appliedAtTime: `2026-10-21T0${index + 1}:00:00Z`, collectedAt: "2026-10-21T00:00:00Z" }))
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [records[1], records[0], records[2]] } })
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await expect(ui.locator("tbody .company-cell strong")).toHaveText(["C 기업", "B 기업", "A 기업"])
  await expect(ui.locator("tbody .submission-time")).toHaveText(["12:00 제출", "11:00 제출", "10:00 제출"])
  const dateSort = ui.getByRole("button", { name: "지원일 / 작성일 정렬", exact: true })
  await expect(dateSort.locator("..")).toHaveAttribute("aria-sort", "descending")
  await expect(ui.getByLabel("지원 날짜 정렬")).toHaveCount(0)
  await expect(ui.getByLabel("지원 상태 필터")).toHaveCount(0)
  await dateSort.click()
  await expect(dateSort.locator("..")).toHaveAttribute("aria-sort", "ascending")
  await expect(ui.locator("tbody .company-cell strong")).toHaveText(["A 기업", "B 기업", "C 기업"])
  const companySort = ui.getByRole("button", { name: "기업 정렬", exact: true })
  await companySort.focus()
  await ui.keyboard.press("Enter")
  await expect(companySort.locator("..")).toHaveAttribute("aria-sort", "ascending")
  await expect(dateSort.locator("..")).toHaveAttribute("aria-sort", "none")
  await expect(ui.locator("tbody .company-cell strong")).toHaveText(["A 기업", "B 기업", "C 기업"])
  await companySort.click()
  await expect(ui.locator("tbody .company-cell strong")).toHaveText(["C 기업", "B 기업", "A 기업"])
  await dateSort.click()
  await expect(dateSort.locator("..")).toHaveAttribute("aria-sort", "descending")
  await ui.getByRole("button", { name: "C 기업 개발자 상태 수정", exact: true }).click()
  await expect(ui.getByRole("dialog").getByLabel("상태", { exact: true })).toBeFocused()
  await ui.getByRole("dialog").getByLabel("상태", { exact: true }).selectOption("pending_confirmation")
  await ui.getByRole("button", { name: "변경 저장", exact: true }).click()
  await expect(ui.locator("tbody tr").first()).toContainText("확인 대기")
  await ui.getByRole("button", { name: "C 기업 개발자 상태 수정", exact: true }).click()
  await ui.getByRole("dialog").getByLabel("상태", { exact: true }).selectOption("applied")
  await ui.getByRole("button", { name: "변경 저장", exact: true }).click()
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [{ ...records[0], lastSeenAt: "2026-10-22T00:00:00Z", lastSyncedAt: "2026-10-22T00:00:00Z" }] } })
  await expect(ui.locator("tbody .company-cell strong")).toHaveText(["C 기업", "B 기업", "A 기업"])
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.locator(".recent-record > div:first-child strong")).toHaveText(["C 기업", "B 기업", "A 기업"])
  await popup.close()
  const unknown = [
    record({ sourceApplicationId: "review-1", companyName: "상태 확인 기업 1", status: "unknown", sourceStatus: "판독하지 못한 상태", appliedAt: "2026-10-20" }),
    record({ platform: "wanted", sourceApplicationId: "review-2", companyName: "상태 확인 기업 2", status: "unknown", appliedAt: "2026-10-19", submissionAttemptId: "00000000-0000-4000-8000-000000000021", submissionStage: "unverified" }),
    record({ platform: "manual", sourceApplicationId: "review-3", companyName: "상태 확인 기업 3", status: "unknown", appliedAt: undefined, sourceCreatedAt: "2027-01-01T00:00:00+09:00" })
  ]
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: unknown } })
  await ui.evaluate(async () => chrome.storage.local.set({ submissionAttempts: [{ id: "00000000-0000-4000-8000-000000000021", platform: "wanted", tabId: 999999, frameId: 0, sourceJobId: "100", stage: "unverified", reason: "timeout", context: { sourceJobId: "100", companyName: "상태 확인 기업 2", jobTitle: "개발자", jobUrl: "https://www.wanted.co.kr/wd/100" }, startedAt: "2026-10-19T01:00:00Z", updatedAt: "2026-10-19T01:00:00Z" }] }))
  await expect(ui.getByRole("button", { name: "상태 확인 3", exact: true })).toBeVisible()
  await expect(ui.locator("tbody .company-cell strong").first()).toHaveText("C 기업")
  await expect(ui.locator("tbody .company-cell strong").last()).toHaveText("상태 확인 기업 3")
  await ui.getByRole("button", { name: "상태 확인 3", exact: true }).click()
  const panel = ui.getByRole("region", { name: "지원 상태 확인", exact: true })
  await expect(panel).toBeInViewport()
  const reviewToggle = ui.getByRole("button", { name: "상태 확인 3", exact: true })
  await expect(reviewToggle).toHaveAttribute("aria-pressed", "true")
  await expect(ui.locator("tbody tr")).toHaveCount(3)
  await reviewToggle.click()
  await expect(reviewToggle).toHaveAttribute("aria-pressed", "false")
  await expect(panel).toHaveCount(0)
  await expect(ui.locator("tbody tr")).toHaveCount(6)
  await reviewToggle.click()
  await expect(reviewToggle).toHaveAttribute("aria-pressed", "true")
  await expect(ui.locator("tbody tr")).toHaveCount(3)
  await expect(ui.locator(".platform-tag.wanted")).toHaveCSS("background-color", "rgb(131, 100, 255)")
  await expect(ui.getByRole("region", { name: "지원 진행 상태", exact: true })).toBeVisible()
  await expect(ui.locator(".review-imports button")).toHaveCount(2)
  const status = ui.locator("tbody .status.unknown").first()
  const badgeBox = (await status.boundingBox())!, iconBox = (await status.locator(".status-alert").boundingBox())!
  expect(iconBox.y).toBeLessThan(badgeBox.y)
  expect(iconBox.x + iconBox.width).toBeGreaterThan(badgeBox.x + badgeBox.width)
  await ui.screenshot({ path: "docs/screenshots/record-status-review-light.png", fullPage: true })
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, theme: "dark" } })
  await expect(ui.locator("html")).toHaveAttribute("data-theme", "dark")
  await ui.setViewportSize({ width: 390, height: 844 })
  expect(await ui.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await ui.getByRole("button", { name: "상태 확인 기업 1 개발자 상태 확인", exact: true }).click()
  const dialog = ui.getByRole("dialog", { name: "지원 기록 수정", exact: true })
  await expect(dialog.getByRole("button", { name: "변경 저장", exact: true })).toBeDisabled()
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(342)
  await dialog.getByLabel("상태", { exact: true }).selectOption("applied")
  await expect(dialog.getByRole("button", { name: "변경 저장", exact: true })).toBeInViewport()
  await ui.screenshot({ path: "docs/screenshots/record-status-review-mobile.png", fullPage: true })
  await dialog.getByRole("button", { name: "저장하고 다음 확인", exact: true }).click()
  await expect(dialog.getByLabel("기업명", { exact: true })).toHaveValue("상태 확인 기업 2")
  await ui.setViewportSize({ width: 320, height: 720 })
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(ui.locator("tbody tr")).toHaveCount(2)
  const resolved = (await rpc<Snapshot>(ui, { type: "snapshot" })).records.find(record => record.companyName === "상태 확인 기업 1")!
  expect(resolved.status).toBe("applied")
  expect(resolved.sourceStatus).toBeUndefined()
  await dialog.getByLabel("상태", { exact: true }).selectOption("cancelled")
  await dialog.getByRole("button", { name: "저장하고 다음 확인", exact: true }).click()
  await expect(dialog.getByLabel("기업명", { exact: true })).toHaveValue("상태 확인 기업 3")
  await expect(ui.getByRole("region", { name: "지원 진행 상태", exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel("지원 날짜", { exact: true })).toHaveValue("")
  await dialog.getByLabel("상태", { exact: true }).selectOption("applied")
  await dialog.getByRole("button", { name: "변경 저장", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(panel).toContainText("상태 확인을 모두 마쳤어요")
  await expect(ui.locator(".status-alert")).toHaveCount(0)
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).records.find(record => record.companyName === "상태 확인 기업 3")?.appliedAt).toBeUndefined()
  await ui.getByRole("button", { name: "상태 확인 0", exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(ui.getByLabel("지원 상태 필터")).toHaveCount(0)
  await expect(ui.locator("tbody tr")).toHaveCount(5)
  const current = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...current.settings, showCancelled: true } })
  await ui.getByRole("button", { name: "상태 확인 기업 2 개발자 상태 수정", exact: true }).click()
  await expect(dialog.getByLabel("상태", { exact: true })).toHaveValue("cancelled")
  await dialog.getByRole("button", { name: "취소", exact: true }).click()
})

test("지원 기록 대량 목록: 100건 페이지·검색 초기화·전체 CSV", async ({ ui }) => {
  const records = Array.from({ length: 205 }, (_, index) => record({ platform: "manual", sourceApplicationId: `paging-${index}`, companyName: `Pagination ${String(index).padStart(3, "0")}`, jobTitle: "Developer" }))
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records } })
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await ui.getByRole("button", { name: "기업 정렬", exact: true }).click()
  const cells = ui.locator("tbody .company-cell strong"), pages = ui.getByRole("navigation", { name: "지원 기록 페이지" })
  await expect(cells).toHaveCount(100)
  await expect(cells.first()).toHaveText("Pagination 000")
  await pages.getByRole("button", { name: "다음 페이지" }).click()
  await expect(cells.first()).toHaveText("Pagination 100")
  await expect(pages.getByRole("status")).toHaveText("2 / 3 페이지")
  const downloaded = ui.waitForEvent("download")
  await ui.getByRole("button", { name: "CSV 내보내기" }).click()
  const stream = await (await downloaded).createReadStream()
  let csv = ""
  for await (const chunk of stream!) csv += chunk.toString()
  expect(csv.split("\r\n")).toHaveLength(206)
  expect(csv).toContain("Pagination 204")
  await pages.getByRole("button", { name: "다음 페이지" }).click()
  await expect(cells).toHaveCount(5)
  await expect(cells.last()).toHaveText("Pagination 204")
  await expect(pages.getByRole("button", { name: "다음 페이지" })).toBeDisabled()
  await ui.setViewportSize({ width: 390, height: 844 })
  await pages.scrollIntoViewIfNeeded()
  await expect(pages.getByRole("status")).toBeVisible()
  const bounds = await pages.boundingBox()
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390).toBe(true)
  await ui.screenshot({ path: "docs/screenshots/records-pagination-mobile.png" })
  await ui.setViewportSize({ width: 1440, height: 1000 })
  await ui.getByLabel("기업명 또는 직무 검색").fill("Pagination 204")
  await expect(cells).toHaveCount(1)
  await expect(pages).toHaveCount(0)
  await ui.getByLabel("기업명 또는 직무 검색").fill("")
  await expect(cells.first()).toHaveText("Pagination 000")
  await expect(cells).toHaveCount(100)
})

test("메모 저장은 플래너만 갱신하고 채용 탭의 지원 이력 재조회를 유발하지 않는다", async ({ ui, context }) => {
  const prior = record({ companyName: "넛지헬스케어", sourceApplicationId: "planner-invalidation" })
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [prior] } })
  await context.route("https://www.saramin.co.kr/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("saramin-category-postings.html") }))
  const jobs = await context.newPage(); await jobs.goto("https://www.saramin.co.kr/zf_user/jobs/list/job-category")
  await expect(jobs.locator("todaystart-warning")).toHaveCount(2)
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  const before = await rpc<Snapshot>(ui, { type: "snapshot" })
  const worker = context.serviceWorkers()[0]!
  await worker.evaluate(() => {
    const audit = { planner: 0, contentSnapshots: 0 }
    ;(self as unknown as { optimizationAudit: typeof audit }).optimizationAudit = audit
    chrome.runtime.onMessage.addListener((request, sender) => {
      if (request.type === "planner_snapshot") audit.planner++
      if (request.type === "snapshot" && !sender.url?.startsWith(chrome.runtime.getURL(""))) audit.contentSnapshots++
    })
  })
  await rpc(ui, { type: "note_save", note: { id: crypto.randomUUID(), expectedRevision: 0, title: "분리 저장 메모", body: "메모 변경", pinned: false, checklist: [] }, dataGeneration: before.dataGeneration })
  await expect(ui.getByRole("heading", { name: "분리 저장 메모", exact: true })).toBeVisible()
  const audit = await worker.evaluate(() => (self as unknown as { optimizationAudit: { planner: number; contentSnapshots: number } }).optimizationAudit)
  expect(audit.planner).toBeGreaterThan(0)
  expect(audit.contentSnapshots).toBe(0)
  await expect(jobs.locator("todaystart-warning")).toHaveCount(2)
  const partial = await rpc<Record<string, unknown>>(ui, { type: "planner_snapshot" })
  expect(Object.keys(partial).sort()).toEqual(before.dataGeneration ? ["dataGeneration", "planner"] : ["planner"])
  expect(partial.dataGeneration).toBe(before.dataGeneration)
})

test("지원 기록의 모든 데이터 헤더에서 표시값 기준으로 양방향 정렬한다", async ({ ui }) => {
  const records = [
    record({ platform: "manual", sourceApplicationId: "column-A", companyName: "가 기업", jobTitle: "직무 3", sourceLabel: "경로 3", appliedAt: "2026-10-20", status: "applied", sourceStatus: "불합격", readStatus: "read" }),
    record({ platform: "manual", sourceApplicationId: "column-B", companyName: "나 기업", jobTitle: "직무 1", sourceLabel: "경로 1", appliedAt: "2026-10-19", status: "unknown", readStatus: "unknown" }),
    record({ platform: "manual", sourceApplicationId: "column-C", companyName: "다 기업", jobTitle: "직무 2", sourceLabel: "경로 2", appliedAt: "2026-10-21", status: "pending_confirmation", readStatus: "unread" })
  ]
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records } })
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  const cases: [string, string[]][] = [
    ["기업", ["가 기업", "나 기업", "다 기업"]],
    ["지원 직무", ["나 기업", "다 기업", "가 기업"]],
    ["지원 경로", ["나 기업", "다 기업", "가 기업"]],
    ["지원일 / 작성일", ["나 기업", "가 기업", "다 기업"]],
    ["상태", ["가 기업", "나 기업", "다 기업"]],
    ["열람 여부", ["다 기업", "나 기업", "가 기업"]]
  ]
  for (const [label, ascending] of cases) {
    const button = ui.getByRole("button", { name: `${label} 정렬`, exact: true })
    await button.click()
    if (label === "지원일 / 작성일") await button.click()
    await expect(button.locator("..")).toHaveAttribute("aria-sort", "ascending")
    await expect(ui.locator("tbody .company-cell strong")).toHaveText(ascending)
    await button.click()
    await expect(button.locator("..")).toHaveAttribute("aria-sort", "descending")
    await expect(ui.locator("tbody .company-cell strong")).toHaveText([...ascending].reverse())
  }
  await ui.screenshot({ path: "docs/screenshots/record-table-sorting-light.png", fullPage: true })
})

test("메모 보드: 편집 중 연속 리사이즈와 스크롤에 브라우저 오류 없음", async ({ ui }) => {
  const errors: string[] = []
  ui.on("pageerror", error => errors.push(error.message))
  const initial = await rpc<Snapshot>(ui, { type: "snapshot" })
  const body = Array.from({ length: 100 }, (_, index) => `${index + 1}. 긴 메모 내용과 기업 언급의 줄바꿈 위치를 확인해요.`).join("\n")
  const note = await rpc<import("../../src/core/planner").Note>(ui, { type: "note_save", dataGeneration: initial.dataGeneration, note: { id: crypto.randomUUID(), expectedRevision: 0, title: "크기 동기화", body, pinned: false, checklist: [] } })
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  const frame = ui.locator(`[data-note-id="${note.id}"]`)
  await frame.locator("button.note-card").click()
  const field = frame.getByLabel("메모 내용", { exact: true })
  const handle = frame.getByRole("button", { name: "크기 동기화 크기 조절", exact: true })
  const alignment = () => field.evaluate(element => {
    const mirror = element.parentElement!.querySelector<HTMLElement>(".note-mention-backdrop")!
    return { width: mirror.clientWidth === element.clientWidth, top: mirror.scrollTop === element.scrollTop, left: mirror.scrollLeft === element.scrollLeft }
  })
  for (let cycle = 0; cycle < 3; cycle++) {
    const box = (await handle.boundingBox())!
    await ui.mouse.move(box.x + 10, box.y + 10); await ui.mouse.down()
    await ui.mouse.move(box.x + 180, box.y + 110, { steps: 20 })
    await ui.mouse.move(box.x + 20, box.y - 40, { steps: 20 }); await ui.mouse.up()
    await field.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")) })
    await expect.poll(alignment).toEqual({ width: true, top: true, left: true })
    await ui.setViewportSize({ width: 390, height: 844 })
    await expect.poll(alignment).toEqual({ width: true, top: true, left: true })
    await ui.setViewportSize({ width: 1440, height: 1000 })
    await expect.poll(alignment).toEqual({ width: true, top: true, left: true })
  }
  await field.fill(body + "\n추가한 내용")
  await expect.poll(alignment).toEqual({ width: true, top: true, left: true })
  await ui.getByRole("button", { name: "저장하고 닫기", exact: true }).click()
  await frame.locator("button.note-card").click()
  await expect.poll(alignment).toEqual({ width: true, top: true, left: true })
  await ui.getByRole("button", { name: "대시보드", exact: true }).click()
  await ui.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(errors).toEqual([])
})

test("메모 보드: 드래그 순서·모서리 크기 조절·키보드·새로고침 유지", async ({ ui }) => {
  const generation = (await rpc<Snapshot>(ui, { type: "snapshot" })).dataGeneration
  const notes: import("../../src/core/planner").Note[] = []
  for (const title of ["순서 A", "순서 B", "순서 C"]) notes.push(await rpc(ui, { type: "note_save", dataGeneration: generation, note: { id: crypto.randomUUID(), expectedRevision: 0, title, body: `${title} 원본`, pinned: false, checklist: [] } }))
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  const [a,b,c] = notes.map(note => note.id) as [string,string,string], frames = ui.locator(".note-frame")
  const order = () => frames.evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.noteId))
  await expect.poll(order).toEqual([c,b,a])
  const source = (await ui.getByRole("button", { name: "순서 A 순서 이동", exact: true }).boundingBox())!, target = (await ui.locator(`[data-note-id="${c}"]`).boundingBox())!
  await ui.mouse.move(source.x + 10, source.y + 10); await ui.mouse.down(); await ui.mouse.move(target.x + 20, target.y + 65, { steps: 15 }); await ui.mouse.up()
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.board?.order).toEqual([a,c,b])
  const first = ui.locator(`[data-note-id="${a}"]`), handle = (await first.getByRole("button", { name: "순서 A 크기 조절", exact: true }).boundingBox())!
  await ui.mouse.move(handle.x + 10, handle.y + 10); await ui.mouse.down(); await ui.mouse.move(handle.x + 140, handle.y + 110, { steps: 10 }); await ui.mouse.up()
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.board?.sizes[a]).toEqual({ width: 450, height: 460 })
  await ui.reload()
  await expect.poll(order).toEqual([a,c,b])
  expect(Math.round((await first.boundingBox())!.width)).toBe(450)
  expect(Math.round((await first.boundingBox())!.height)).toBe(460)
  await ui.locator(`[data-note-id="${b}"] button.note-card`).click()
  await ui.getByLabel("메모 내용", { exact: true }).fill("편집 중에도 배치는 그대로")
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.notes.find(note => note.id === b)?.body).toBe("편집 중에도 배치는 그대로")
  await expect.poll(order).toEqual([a,c,b])
  await ui.getByRole("button", { name: "순서 B 순서 이동", exact: true }).press("ArrowLeft")
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.board?.order).toEqual([a,b,c])
  await ui.getByRole("button", { name: "순서 A 크기 조절", exact: true }).press("ArrowRight")
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.board?.sizes[a]?.width).toBe(470)
  const before = (await rpc<Snapshot>(ui, { type: "snapshot" })).planner!.board!
  const cancelSource = (await ui.getByRole("button", { name: "순서 C 순서 이동", exact: true }).boundingBox())!, cancelTarget = (await first.boundingBox())!
  await ui.mouse.move(cancelSource.x + 10, cancelSource.y + 10); await ui.mouse.down(); await ui.mouse.move(cancelTarget.x + 15, cancelTarget.y + 65, { steps: 12 }); await ui.keyboard.press("Escape"); await ui.mouse.up()
  await expect.poll(order).toEqual(before.order)
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).planner!.board!.revision).toBe(before.revision)
  await ui.getByLabel("메모 검색", { exact: true }).fill("순서 C")
  await expect(frames).toHaveCount(2) // The active editor remains visible alongside matching results.
  await ui.getByLabel("메모 검색", { exact: true }).fill("")
  await expect.poll(order).toEqual(before.order)
  await ui.screenshot({ path: "docs/screenshots/note-board-layout-light.png", fullPage: true })
})

test("메모 보드: 더 보기 팝오버·크기 프리셋·백업 복원·초기화", async ({ ui }) => {
  const initial = await rpc<Snapshot>(ui, { type: "snapshot" })
  const note = await rpc<import("../../src/core/planner").Note>(ui, { type: "note_save", dataGeneration: initial.dataGeneration, note: { id: crypto.randomUUID(), expectedRevision: 0, title: "메뉴 확인", body: "메뉴가 본문을 밀어내면 안 돼요.", pinned: false, checklist: [] } })
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  const frame = ui.locator(`[data-note-id="${note.id}"]`), before = (await frame.boundingBox())!
  await ui.getByRole("button", { name: "메뉴 확인 메뉴", exact: true }).click()
  const menu = ui.getByRole("dialog", { name: "메모 메뉴", exact: true })
  await expect(menu).toBeVisible()
  expect(await menu.evaluate(element => !!element.closest(".note-frame"))).toBe(false)
  expect((await frame.boundingBox())!.height).toBe(before.height)
  await menu.getByRole("combobox", { name: "메모 색상", exact: true }).selectOption("cream")
  await menu.getByRole("button", { name: "넓게", exact: true }).click()
  await expect(menu).toHaveCount(0)
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.board?.sizes[note.id]).toEqual({ width: 500, height: 400 })
  await ui.getByRole("button", { name: "메모 더 보기", exact: true }).click()
  await ui.screenshot({ path: "docs/screenshots/note-board-menu-light.png", fullPage: true })
  await ui.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  await expect(ui.getByRole("region", { name: "메모 편집", exact: true })).toBeVisible()
  await ui.getByRole("button", { name: "저장하고 닫기", exact: true }).click()
  const backup = await rpc<Awaited<ReturnType<import("../../src/storage/repository").ApplicationRepository["backup"]>>>(ui, { type: "backup" })
  await rpc(ui, { type: "reset_data" })
  await expect(framesFor(ui)).toHaveCount(0)
  await expect(rpc(ui, { type: "note_layout", dataGeneration: initial.dataGeneration, change: { kind: "resize", id: note.id, size: { width: 280, height: 280 } } })).rejects.toThrow("초기화")
  await rpc(ui, { type: "restore", backup })
  await expect.poll(async () => Math.round((await frame.boundingBox())?.width || 0)).toBe(500)
  await ui.setViewportSize({ width: 390, height: 844 })
  expect(await ui.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await ui.getByRole("button", { name: "메뉴 확인 메뉴", exact: true }).click()
  const box = (await menu.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(box.y + box.height).toBeLessThanOrEqual(844)
  await ui.screenshot({ path: "docs/screenshots/note-board-mobile.png", fullPage: true })
})
function framesFor(ui: Page) { return ui.locator(".note-frame") }

test("스티커 메모: 기업 @언급, 다중 연결과 수정·새로고침", async ({ ui }) => {
  const records = [record({ sourceApplicationId: "mention-front", companyName: "스티커 기업", jobTitle: "프론트엔드 개발자" }), record({ sourceApplicationId: "mention-back", companyName: "스티커 기업", jobTitle: "백엔드 개발자" }), record({ sourceApplicationId: "mention-next", companyName: "다음 기업", jobTitle: "서비스 개발자" })]
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records } })
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  await ui.locator(".page-heading").getByRole("button", { name: "+ 메모 작성", exact: true }).click()
  const dialog = ui.getByRole("region", { name: "메모 편집", exact: true }), body = dialog.getByLabel("메모 내용", { exact: true })
  await expect(dialog.getByLabel("지원 연결", { exact: true })).toHaveCount(0)
  await dialog.getByLabel("메모 제목", { exact: true }).fill("두 기업의 면접 준비")
  await body.fill("질문 정리\n@스티커")
  await expect(ui.getByRole("listbox", { name: "지원했던 기업", exact: true }).getByRole("option")).toHaveCount(2)
  await body.press("Escape")
  await expect(ui.getByRole("listbox")).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await body.press("End")
  await ui.getByRole("listbox", { name: "지원했던 기업", exact: true }).getByRole("option", { name: /스티커 기업.*백엔드 개발자/ }).click()
  await expect(body).toHaveValue("질문 정리\n@스티커 기업 ")
  await body.fill((await body.inputValue()) + "@다음")
  await body.dispatchEvent("keydown", { key: "Enter", isComposing: true })
  await expect(ui.getByRole("listbox")).toBeVisible()
  await body.press("ArrowDown")
  await body.press("Enter")
  await expect(dialog.locator(".note-linked-companies > span")).toHaveCount(2)
  await dialog.getByRole("button", { name: "메모 더 보기", exact: true }).click()
  await ui.getByRole("dialog", { name: "메모 메뉴", exact: true }).getByRole("combobox", { name: "메모 색상", exact: true }).selectOption("sage")
  await ui.getByRole("dialog", { name: "메모 메뉴", exact: true }).getByRole("checkbox", { name: "상단에 고정", exact: true }).check()
  await ui.screenshot({ path: "docs/screenshots/sticky-note-editor-light.png", fullPage: true })
  await ui.locator(".page-heading").click({ position: { x: 20, y: 5 } })
  await expect(dialog).toHaveCount(0)
  let snapshot = await rpc<Snapshot>(ui, { type: "snapshot" }), note = snapshot.planner!.notes[0]!
  expect(note.color).toBe("sage"); expect(note.mentions).toHaveLength(2); expect(note.linkId).toBeUndefined()
  const backId = snapshot.records.find(record => record.jobTitle === "백엔드 개발자")!.id
  expect(snapshot.planner!.links.find(link => link.id === note.mentions![0]!.linkId)?.recordId).toBe(backId)
  await expect(ui.locator(".note-card")).toHaveAttribute("data-note-color", "sage")
  await expect(ui.locator(".note-card .note-mention")).toHaveCount(2)
  await ui.reload()
  await ui.getByRole("navigation", { name: "주 메뉴", exact: true }).getByRole("button", { name: /^지원 기록/ }).click()
  await ui.getByRole("button", { name: "스티커 기업 백엔드 개발자 메모와 일정", exact: true }).click()
  await ui.getByRole("button", { name: "메모 1", exact: true }).click()
  await expect(ui.locator(".detail-note")).toContainText("두 기업의 면접 준비")
  await ui.getByRole("button", { name: "닫기", exact: true }).click()
  await ui.getByRole("button", { name: "스티커 기업 프론트엔드 개발자 메모와 일정", exact: true }).click()
  await expect(ui.getByRole("button", { name: "메모 0", exact: true })).toBeVisible()
  await ui.getByRole("button", { name: "닫기", exact: true }).click()
  await ui.getByRole("button", { name: "다음 기업 서비스 개발자 메모와 일정", exact: true }).click()
  await expect(ui.getByRole("button", { name: "메모 1", exact: true })).toBeVisible()
  await ui.getByRole("button", { name: "닫기", exact: true }).click()
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  await ui.locator(".note-card").click()
  await dialog.getByRole("button", { name: "메모 더 보기", exact: true }).click()
  await expect(ui.getByRole("dialog", { name: "메모 메뉴", exact: true }).getByRole("combobox", { name: "메모 색상", exact: true })).toHaveValue("sage")
  await body.fill((await body.inputValue()).replace("@스티커 기업", "기업 이름 수정"))
  await expect(dialog.locator(".note-linked-companies > span")).toHaveCount(1)
  await dialog.getByRole("button", { name: "저장하고 닫기", exact: true }).click()
  snapshot = await rpc<Snapshot>(ui, { type: "snapshot" }); note = snapshot.planner!.notes[0]!
  expect(note.mentions).toHaveLength(1); expect(note.mentions![0]!.label).toBe("다음 기업")
})

test("스티커 메모: 언급 확정 뒤 공백·일반 입력·커서 이동은 검색을 다시 열지 않음", async ({ ui }) => {
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [record({ companyName: "완료기업" })] } })
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  const editor = ui.getByRole("region", { name: "메모 편집", exact: true }), body = editor.getByLabel("메모 내용", { exact: true })
  for (const mode of ["Enter", "click"]) {
    await ui.locator(".page-heading").getByRole("button", { name: "+ 메모 작성", exact: true }).click()
    await editor.getByLabel("메모 제목", { exact: true }).fill(`${mode} 확정 확인`)
    await body.fill("@완료")
    await expect(ui.getByRole("listbox", { name: "지원했던 기업", exact: true }).getByRole("option")).toHaveCount(1)
    if (mode === "Enter") await body.press("Enter")
    else await ui.getByRole("listbox", { name: "지원했던 기업", exact: true }).getByRole("option").click()
    await expect(ui.getByRole("listbox")).toHaveCount(0)
    await body.press("Space")
    await expect(ui.getByRole("listbox")).toHaveCount(0)
    await body.pressSequentially("면접 준비")
    await expect(ui.getByRole("listbox")).toHaveCount(0)
    await body.press("Home"); await body.press("End")
    await expect(ui.getByRole("listbox")).toHaveCount(0)
    await expect(editor.locator(".note-mention-backdrop .note-mention")).toHaveText("@완료기업")
    await editor.getByRole("button", { name: "메모 더 보기", exact: true }).click()
    await expect(editor.locator(".note-color-picker")).toHaveCount(0)
    await expect(editor.getByRole("radio")).toHaveCount(0)
    await expect(ui.getByRole("dialog", { name: "메모 메뉴", exact: true }).getByRole("combobox", { name: "메모 색상", exact: true })).toBeVisible()
    await ui.screenshot({ path: `docs/screenshots/sticky-notes-muted-${mode}.png`, fullPage: true })
    await editor.getByRole("button", { name: "저장하고 닫기", exact: true }).click()
  }
  await ui.locator(".page-heading").getByRole("button", { name: "+ 메모 작성", exact: true }).click()
  await body.fill("@완료")
  await body.press("Space")
  await expect(ui.getByRole("listbox")).toHaveCount(0)
  await body.pressSequentially("그냥 메모")
  await expect(ui.getByRole("listbox")).toHaveCount(0)
  await body.pressSequentially(" @완료")
  await expect(ui.getByRole("listbox", { name: "지원했던 기업", exact: true }).getByRole("option")).toHaveCount(1)
  await body.press("Enter")
  await expect(ui.getByRole("listbox")).toHaveCount(0)
  await editor.getByRole("button", { name: "저장하고 닫기", exact: true }).click()
  const notes = (await rpc<Snapshot>(ui, { type: "snapshot" })).planner!.notes
  expect(notes).toHaveLength(3)
  for (const note of notes) expect(note.mentions).toHaveLength(1)
})

test("스티커 메모: 보드에서 바로 편집, 언급 블록 삭제와 빠른 메모 전환", async ({ ui }) => {
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [record({ companyName: "블록 기업" })] } })
  const initial = await rpc<Snapshot>(ui, { type: "snapshot" })
  for (const title of ["첫 메모", "다른 메모"]) await rpc(ui, { type: "note_save", dataGeneration: initial.dataGeneration, note: { id: crypto.randomUUID(), expectedRevision: 0, title, body: title + "의 원본", pinned: false, checklist: [] } })
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  await ui.locator("button.note-card").filter({ hasText: "첫 메모" }).click()
  const editor = ui.getByRole("region", { name: "메모 편집", exact: true }), body = editor.getByLabel("메모 내용", { exact: true })
  await expect(ui.locator(".planner-backdrop")).toHaveCount(0)
  await expect(ui.getByRole("dialog")).toHaveCount(0)
  expect(await editor.evaluate(element => !!element.closest(".notes-grid"))).toBe(true)
  await body.fill("준비 @블록")
  await ui.getByRole("listbox", { name: "지원했던 기업", exact: true }).getByRole("option", { name: /블록 기업/ }).click()
  await expect(editor.locator(".note-mention-backdrop .note-mention")).toHaveText("@블록 기업")
  const mirror = editor.locator(".note-mention-backdrop")
  expect(await mirror.evaluate(element => element.clientWidth)).toBe(await body.evaluate(element => element.clientWidth))
  await ui.screenshot({ path: "docs/screenshots/sticky-notes-inline-mention.png", fullPage: true })
  await body.press("Backspace")
  await body.press("Backspace")
  await expect(body).toHaveValue("준비 ")
  await expect(editor.locator(".note-mention-backdrop .note-mention")).toHaveCount(0)
  await body.fill("첫 메모에서 빠르게 바꾼 내용")
  await ui.locator("button.note-card").filter({ hasText: "다른 메모" }).click()
  await expect(editor.getByLabel("메모 제목", { exact: true })).toHaveValue("다른 메모")
  await expect(body).toHaveValue("다른 메모의 원본")
  await body.fill("다른 메모도 바로 저장")
  await ui.locator(".page-heading").getByRole("button", { name: "+ 메모 작성", exact: true }).click()
  await expect(editor.getByLabel("메모 제목", { exact: true })).toHaveValue("")
  await editor.getByLabel("메모 제목", { exact: true }).fill("새 스티커")
  await body.fill("메뉴를 눌러 이동해도 보존")
  await ui.getByRole("button", { name: "대시보드", exact: true }).click()
  const notes = (await rpc<Snapshot>(ui, { type: "snapshot" })).planner!.notes
  expect(notes).toHaveLength(3)
  expect(notes.find(note => note.title === "첫 메모")?.body).toBe("첫 메모에서 빠르게 바꾼 내용")
  expect(notes.find(note => note.title === "다른 메모")?.body).toBe("다른 메모도 바로 저장")
  expect(notes.find(note => note.title === "새 스티커")?.body).toBe("메뉴를 눌러 이동해도 보존")
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  await expect(ui.locator(".sticky-note-editor")).toHaveCount(0)
  await expect(ui.locator("button.note-card")).toHaveCount(3)
})

test("스티커 메모: 색상·모바일·테마와 설정에만 저장 안내", async ({ ui }) => {
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  const notes = [
    { color: "yellow", title: "면접 전에 읽어 볼 질문", body: "나를 소개하는 한 문장\n프로젝트에서 바꾼 것과 배운 것\n팀에게 물어보고 싶은 것" },
    { color: "sage", title: "오늘 알게 된 것", body: "경험은 짧게, 내 선택의 이유는 구체적으로.\n다음 면접에서는 결과까지 이어서 말하기." },
    { color: "lavender", title: "기업 조사 체크", body: "서비스를 직접 써 보고\n좋았던 점 세 가지와 궁금한 점 하나 적기." },
    { color: "rose", title: "면접이 끝난 뒤", body: "아쉬웠던 답변은 다시 적어 두기.\n잘한 것도 꼭 한 가지 남겨 두기." },
    { color: "cream", title: "이번 주 할 일", body: "포트폴리오 정리\n자기소개 소리 내어 읽기\n산책하면서 잠깐 쉬기" }
  ] as const
  for (const note of notes) await rpc(ui, { type: "note_save", dataGeneration: snapshot.dataGeneration, note: { ...note, id: crypto.randomUUID(), expectedRevision: 0, pinned: note.color === "yellow", checklist: [] } })
  for (const view of ["대시보드", "지원 기록", "취업 캘린더", "메모"]) {
    await ui.getByRole("navigation", { name: "주 메뉴", exact: true }).getByRole("button", { name: new RegExp(`^${view}`) }).click()
    await expect(ui.locator(".local-data-info")).toHaveCount(0)
  }
  await expect(ui.locator(".note-card")).toHaveCount(5)
  await ui.screenshot({ path: "docs/screenshots/sticky-notes-light.png", fullPage: true })
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, theme: "dark" } })
  await expect(ui.locator("html")).toHaveAttribute("data-theme", "dark")
  await ui.screenshot({ path: "docs/screenshots/sticky-notes-dark.png", fullPage: true })
  await ui.setViewportSize({ width: 390, height: 844 })
  expect(await ui.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await ui.screenshot({ path: "docs/screenshots/sticky-notes-mobile.png", fullPage: true })
  await ui.locator(".note-card").first().click()
  await ui.getByLabel("메모 내용", { exact: true }).fill("@없는기업")
  await expect(ui.getByRole("listbox")).toContainText("지원 기록을 가져오거나 직접 추가")
  expect(await ui.getByRole("region", { name: "메모 편집", exact: true }).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await ui.screenshot({ path: "docs/screenshots/sticky-note-mention-mobile.png", fullPage: true })
  await ui.keyboard.press("Escape")
  await expect(ui.getByRole("region", { name: "메모 편집", exact: true })).toBeVisible()
  await ui.keyboard.press("Escape")
  await expect(ui.getByRole("region", { name: "메모 편집", exact: true })).toHaveCount(0)
  await ui.getByRole("button", { name: "설정", exact: true }).click()
  await expect(ui.locator(".local-data-info")).toBeVisible()
})

test("취업 플래너: 바깥 클릭은 패널을 닫고 미완성 일정은 새로고침 후 복원", async ({ ui }) => {
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [record({ companyName: "바깥 클릭 기업" })] } })
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await ui.getByRole("button", { name: "바깥 클릭 기업 개발자 메모와 일정", exact: true }).click()
  await ui.getByRole("button", { name: "+ 메모 작성", exact: true }).click()
  await ui.getByLabel("메모 제목", { exact: true }).fill("빠르게 닫은 메모")
  await ui.getByLabel("메모 내용", { exact: true }).fill("지원 상세에서 열어도 바깥 클릭은 전부 닫기")
  await ui.locator(".page-heading").click({ position: { x: 20, y: 5 } })
  await expect(ui.getByRole("region", { name: "메모 편집", exact: true })).toHaveCount(0)
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.notes[0]?.body).toContain("전부 닫기")
  await ui.getByRole("button", { name: "취업 캘린더", exact: true }).click()
  await ui.locator(".planner-toolbar").getByRole("button", { name: "+ 일정 추가", exact: true }).click()
  const dialog = ui.getByRole("dialog", { name: "일정 추가", exact: true })
  await dialog.getByLabel("일정 메모", { exact: true }).fill("제목과 날짜는 나중에 채우기")
  await dialog.getByLabel("일정 날짜", { exact: true }).fill("")
  await dialog.getByLabel("일정 링크", { exact: true }).fill("https://")
  await dialog.getByRole("heading", { name: "일정 추가", exact: true }).click()
  await expect(dialog).toBeVisible()
  const heading = (await dialog.getByRole("heading", { name: "일정 추가", exact: true }).boundingBox())!
  await ui.mouse.move(heading.x + 20, heading.y + 10); await ui.mouse.down()
  await ui.mouse.move(20, 80); await ui.mouse.up()
  await expect(dialog).toBeVisible()
  await ui.locator(".planner-backdrop").click({ position: { x: 20, y: 70 } })
  await expect(ui.getByRole("dialog")).toHaveCount(0)
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.events).toEqual([])
  await ui.reload()
  await ui.getByRole("button", { name: "일정 · 제목 없음 이어쓰기", exact: true }).click()
  await expect(dialog.getByLabel("일정 메모", { exact: true })).toHaveValue("제목과 날짜는 나중에 채우기")
  await expect(dialog.getByLabel("일정 날짜", { exact: true })).toHaveValue("")
  await expect(dialog.getByLabel("일정 링크", { exact: true })).toHaveValue("https://")
  await dialog.getByLabel("일정 제목", { exact: true }).fill("복원 후 면접")
  await dialog.getByLabel("일정 날짜", { exact: true }).fill("2026-11-03")
  await dialog.getByLabel("일정 링크", { exact: true }).fill("https://example.com/interview")
  await dialog.getByRole("button", { name: "일정 저장", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(ui.getByRole("region", { name: "임시 저장한 작성 내용" })).toHaveCount(0)
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.events[0]?.title).toBe("복원 후 면접")
})

test("취업 플래너: 이전 백그라운드 오류 안내와 메모·일정 임시 저장 복원", async ({ ui }) => {
  await ui.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime)
    chrome.runtime.sendMessage = ((request: { type: string }) => ["note_save", "event_save"].includes(request.type)
      ? Promise.resolve({ ok: false, error: JSON.stringify([{ code: "invalid_union_discriminator", options: ["snapshot", "edit", "backup", "restore"], path: ["type"], message: "Invalid discriminator value" }]) })
      : original(request)) as typeof chrome.runtime.sendMessage
  })
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  await ui.locator(".page-heading").getByRole("button", { name: "+ 메모 작성", exact: true }).click()
  await ui.getByLabel("메모 제목", { exact: true }).fill("업데이트 전 작성 내용")
  await ui.getByLabel("메모 내용", { exact: true }).fill("오류가 나도 사라지면 안 되는 내용")
  await expect(ui.getByRole("alert")).toContainText("이전 버전의 백그라운드")
  await expect(ui.getByRole("alert")).not.toContainText("invalid_union_discriminator")
  await ui.locator(".page-heading").click({ position: { x: 20, y: 5 } })
  await expect(ui.getByRole("region", { name: "메모 편집", exact: true })).toHaveCount(0)
  await expect(ui.locator(".toast").getByRole("status")).toContainText("임시 저장")
  await ui.getByRole("button", { name: "취업 캘린더", exact: true }).click()
  await ui.locator(".planner-toolbar").getByRole("button", { name: "+ 일정 추가", exact: true }).click()
  await ui.getByLabel("일정 제목", { exact: true }).fill("업데이트 전 면접")
  await ui.getByRole("button", { name: "일정 저장", exact: true }).click()
  await expect(ui.getByRole("alert")).toContainText("chrome://extensions")
  await ui.keyboard.press("Escape")
  await expect(ui.getByRole("dialog")).toHaveCount(0)
  await ui.reload()
  await ui.getByRole("button", { name: "메모 · 업데이트 전 작성 내용 이어쓰기", exact: true }).click()
  await expect(ui.getByLabel("메모 내용", { exact: true })).toHaveValue("오류가 나도 사라지면 안 되는 내용")
  await ui.getByRole("button", { name: "저장하고 닫기", exact: true }).click()
  await ui.getByRole("button", { name: "일정 · 업데이트 전 면접 이어쓰기", exact: true }).click()
  await ui.getByRole("button", { name: "일정 저장", exact: true }).click()
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.planner?.notes[0]?.body).toBe("오류가 나도 사라지면 안 되는 내용")
  expect(snapshot.planner?.events[0]?.title).toBe("업데이트 전 면접")
  await expect(ui.locator(".planner-recovery")).toHaveCount(0)
})

test("취업 플래너: 임시 저장은 초기화 후 복구되거나 이전 창에서 되살아나지 않음", async ({ ui, context, extensionId }) => {
  await ui.getByRole("button", { name: "취업 캘린더", exact: true }).click()
  await ui.locator(".planner-toolbar").getByRole("button", { name: "+ 일정 추가", exact: true }).click()
  await ui.getByLabel("일정 제목", { exact: true }).fill("지울 임시 일정")
  const other = await context.newPage()
  await other.goto(`chrome-extension://${extensionId}/options.html#settings`)
  await other.getByRole("button", { name: "데이터 초기화", exact: true }).click()
  await other.getByRole("button", { name: "지원 데이터 삭제", exact: true }).click()
  await expect(ui.getByRole("dialog")).toHaveCount(0)
  await ui.reload()
  await expect(ui.locator(".planner-recovery")).toHaveCount(0)
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.events).toEqual([])
  await ui.locator(".planner-toolbar").getByRole("button", { name: "+ 일정 추가", exact: true }).click()
  await expect(ui.getByLabel("일정 제목", { exact: true })).toHaveValue("")
})

test("취업 플래너: 지원 메모·면접 일정 연결, 미래 달력과 대시보드 요약", async ({ ui }) => {
  await ui.clock.setFixedTime(new Date("2026-10-21T03:00:00Z"))
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [record({ companyName: "플래너 기업", appliedAt: "2026-10-21" })] } })
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await ui.getByRole("button", { name: "플래너 기업 개발자 메모와 일정", exact: true }).click()
  let detail = ui.getByRole("dialog", { name: "지원 상세", exact: true })
  await detail.getByRole("button", { name: "+ 메모 작성", exact: true }).click()
  const note = ui.getByRole("region", { name: "메모 편집", exact: true })
  await note.getByLabel("메모 제목", { exact: true }).fill("플래너 기업 면접 준비")
  await note.getByRole("button", { name: "메모 더 보기", exact: true }).click()
  await ui.getByRole("dialog", { name: "메모 메뉴", exact: true }).getByText("메모 양식", { exact: true }).click()
  await ui.getByRole("dialog", { name: "메모 메뉴", exact: true }).getByRole("button", { name: "면접 준비", exact: true }).click()
  await note.getByRole("checkbox", { name: "자기소개 연습", exact: true }).check()
  await note.getByRole("button", { name: "저장하고 닫기", exact: true }).click()
  await expect(note).toHaveCount(0)
  await ui.getByRole("navigation", { name: "주 메뉴" }).getByRole("button", { name: /^지원 기록/ }).click()
  await ui.getByRole("button", { name: "플래너 기업 개발자 메모와 일정", exact: true }).click()
  await detail.getByRole("button", { name: "메모 1", exact: true }).click()
  await expect(detail.locator(".detail-note")).toContainText("플래너 기업 면접 준비")
  await detail.getByRole("button", { name: "개요", exact: true }).click()
  await detail.getByRole("button", { name: "+ 일정 추가", exact: true }).click()
  const event = ui.getByRole("dialog", { name: "일정 추가", exact: true })
  await event.getByLabel("일정 제목", { exact: true }).fill("플래너 기업 1차 면접")
  await event.getByLabel("일정 날짜", { exact: true }).fill("2026-10-23")
  await event.getByLabel("일정 시간", { exact: true }).fill("14:00")
  await event.getByLabel("일정 장소", { exact: true }).fill("온라인")
  await event.getByLabel("일정 링크", { exact: true }).fill("https://example.com/meeting")
  await event.getByLabel("새 할 일", { exact: true }).fill("포트폴리오 확인")
  await event.getByRole("button", { name: "할 일 추가", exact: true }).click()
  await event.getByRole("button", { name: "일정 저장", exact: true }).click()
  await detail.getByRole("button", { name: "일정 1", exact: true }).click()
  await expect(detail.locator(".career-event-item")).toContainText("2026.10.23 · 14:00")
  await detail.getByRole("button", { name: "닫기", exact: true }).click()
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.planner?.notes[0]?.checklist[0]?.done).toBe(true)
  expect(snapshot.planner?.notes[0]?.linkId).toBe(snapshot.planner?.events[0]?.linkId)
  await ui.getByRole("button", { name: "대시보드", exact: true }).click()
  await expect(ui.locator(".upcoming-card")).toContainText("플래너 기업 1차 면접")
  await expect(ui.locator(".summary-total dd")).toHaveText("1건")
  await ui.getByRole("button", { name: "취업 캘린더", exact: true }).click()
  await expect(ui.locator(".career-day")).toHaveCount(42)
  const grid = ui.locator(".career-month-grid"), height = (await grid.boundingBox())!.height
  await ui.getByRole("button", { name: "2026-10-23 일정 1건", exact: true }).click()
  await expect(ui.getByRole("complementary", { name: "선택 날짜 일정", exact: true })).toContainText("플래너 기업 1차 면접")
  await ui.getByRole("button", { name: "다음 달", exact: true }).click()
  await expect(ui.locator(".career-day")).toHaveCount(42)
  expect((await grid.boundingBox())!.height).toBe(height)
  await ui.getByRole("button", { name: "2026-11-03 일정 0건", exact: true }).click()
  await ui.locator(".planner-toolbar").getByRole("button", { name: "+ 일정 추가", exact: true }).click()
  await expect(event.getByLabel("일정 날짜", { exact: true })).toHaveValue("2026-11-03")
  await event.getByRole("button", { name: "닫기", exact: true }).first().click()
  await ui.getByRole("button", { name: "이전 달", exact: true }).click()
  await ui.getByRole("button", { name: "2026-10-23 일정 1건", exact: true }).click()
  await ui.screenshot({ path: "docs/screenshots/career-calendar-light.png", fullPage: true })
  await ui.getByRole("button", { name: "목록", exact: true }).click()
  await expect(ui.locator(".career-list-view")).toContainText("플래너 기업 1차 면접")
  await ui.locator(".career-list-view .career-event-item").click()
  const editEvent = ui.getByRole("dialog", { name: "일정 수정", exact: true })
  await editEvent.getByLabel("일정 진행 상태", { exact: true }).selectOption("completed")
  await editEvent.getByRole("button", { name: "일정 저장", exact: true }).click()
  await expect(ui.locator(".career-list-view .career-event-item")).toHaveCount(0)
  await ui.getByRole("checkbox", { name: "완료·취소 포함", exact: true }).check()
  await expect(ui.locator(".career-list-view .career-event-item")).toContainText("완료")
  await ui.getByRole("button", { name: "월간", exact: true }).click()
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, theme: "dark" } })
  await ui.setViewportSize({ width: 390, height: 844 })
  expect(await ui.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await ui.screenshot({ path: "docs/screenshots/career-calendar-dark-mobile.png", fullPage: true })
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  await ui.getByLabel("메모 검색", { exact: true }).fill("플래너")
  await expect(ui.locator(".note-card")).toHaveCount(1)
  await ui.locator(".note-card").click()
  await expect(note.getByLabel("메모 내용", { exact: true })).toHaveValue(/예상 질문/)
  await ui.screenshot({ path: "docs/screenshots/note-editor-dark-mobile.png", fullPage: true })
  await note.getByRole("button", { name: "저장하고 닫기", exact: true }).click()
})

test("취업 플래너: 메모 자동 저장, 다중 창 충돌 보존과 별도 메모 저장", async ({ ui, context, extensionId }) => {
  const generation = (await rpc<Snapshot>(ui, { type: "snapshot" })).dataGeneration
  const saved = await rpc<import("../../src/core/planner").Note>(ui, { type: "note_save", dataGeneration: generation, note: { id: crypto.randomUUID(), expectedRevision: 0, title: "공유 메모", body: "원본", pinned: false, checklist: [] } })
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  await ui.locator(".note-card").click()
  const other = await context.newPage()
  await other.goto(`chrome-extension://${extensionId}/options.html#notes`)
  await other.locator(".note-card").click()
  await ui.getByLabel("메모 내용", { exact: true }).fill("첫 번째 창에서 저장한 내용")
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.notes[0]?.body).toBe("첫 번째 창에서 저장한 내용")
  await other.getByLabel("메모 내용", { exact: true }).fill("두 번째 창의 보존할 내용")
  await expect(other.getByRole("alert")).toContainText("다른 창")
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.notes[0]?.body).toBe("첫 번째 창에서 저장한 내용")
  await other.getByRole("button", { name: "새 메모로 저장", exact: true }).click()
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).planner?.notes.length).toBe(2)
  await other.getByRole("button", { name: "저장하고 닫기", exact: true }).click()
  await ui.getByRole("button", { name: "저장하고 닫기", exact: true }).click()
  await ui.locator(".page-heading").getByRole("button", { name: "+ 메모 작성", exact: true }).click()
  await ui.getByLabel("메모 제목", { exact: true }).fill("바로 닫아도 보존")
  await ui.getByLabel("메모 내용", { exact: true }).fill("600ms를 기다리지 않은 본문")
  await ui.getByRole("button", { name: "체크리스트 추가", exact: true }).click()
  await ui.getByLabel("새 할 일", { exact: true }).fill("한글 입력")
  await ui.getByLabel("새 할 일", { exact: true }).dispatchEvent("keydown", { key: "Enter", isComposing: true })
  await expect(ui.locator(".checklist-item")).toHaveCount(0)
  await ui.getByLabel("새 할 일", { exact: true }).press("Enter")
  await ui.getByRole("button", { name: "메모 더 보기", exact: true }).click()
  await ui.getByRole("dialog", { name: "메모 메뉴", exact: true }).getByRole("checkbox", { name: "상단에 고정", exact: true }).check()
  await ui.getByRole("button", { name: "저장하고 닫기", exact: true }).click()
  await ui.reload()
  await expect(ui.locator(".note-card")).toHaveCount(3)
  await expect(ui.locator(".note-card").first()).toContainText("바로 닫아도 보존")
  const notes = (await rpc<Snapshot>(ui, { type: "snapshot" })).planner!.notes
  expect(notes.find(note => note.id === saved.id)?.body).toBe("첫 번째 창에서 저장한 내용")
  expect(notes.some(note => note.body === "두 번째 창의 보존할 내용")).toBe(true)
  await ui.screenshot({ path: "docs/screenshots/notes-page-light.png", fullPage: true })
})

test("취업 플래너: 전체 백업·초기화·복원과 늦은 저장 차단", async ({ ui, context, extensionId }) => {
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [record({ companyName: "백업 연결 기업" })] } })
  const initial = await rpc<Snapshot>(ui, { type: "snapshot" }), linkId = initial.planner!.links[0]!.id
  const note = { id: crypto.randomUUID(), expectedRevision: 0, title: "백업 메모", body: "연결된 내용", pinned: true, checklist: [], linkId }
  await rpc(ui, { type: "note_save", note, dataGeneration: initial.dataGeneration })
  await rpc(ui, { type: "event_save", dataGeneration: initial.dataGeneration, event: { id: crypto.randomUUID(), expectedRevision: 0, title: "시간 미정 마감", kind: "deadline", status: "planned", date: "2026-11-03", location: "", body: "", checklist: [], linkId } })
  const backup = await rpc<Awaited<ReturnType<import("../../src/storage/repository").ApplicationRepository["backup"]>>>(ui, { type: "backup" })
  expect(backup.version).toBe(2)
  await ui.getByRole("button", { name: "설정", exact: true }).click()
  await ui.getByRole("button", { name: "데이터 초기화", exact: true }).click()
  const reset = ui.getByRole("dialog", { name: "지원 데이터를 초기화할까요?", exact: true })
  await expect(reset).toContainText("메모 1건, 일정 1건")
  await reset.getByRole("button", { name: "지원 데이터 삭제", exact: true }).click()
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).planner).toEqual({ links: [], notes: [], events: [] })
  await expect(rpc(ui, { type: "note_save", note: { ...note, id: crypto.randomUUID(), linkId: undefined }, dataGeneration: initial.dataGeneration })).rejects.toThrow("초기화")
  await ui.getByLabel("JSON 백업 파일").setInputFiles({ name: "planner-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(ui.getByRole("status").filter({ hasText: "백업 복원 완료" })).toContainText("메모 1건 · 일정 1건")
  const restored = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(restored.planner!.notes[0]?.linkId).toBe(restored.planner!.links[0]?.id)
  expect(restored.planner!.events[0]?.time).toBeUndefined()
  expect(restored.planner!.events[0]?.linkId).toBe(restored.planner!.links[0]?.id)
  await ui.getByRole("button", { name: "지원 기록", exact: false }).first().click()
  await ui.getByRole("button", { name: "백업 연결 기업 개발자 삭제", exact: true }).click()
  await ui.getByRole("button", { name: "기록 삭제", exact: true }).click()
  const detached = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(detached.records).toHaveLength(0)
  expect(detached.planner!.notes[0]?.linkId).toBeUndefined()
  expect(detached.planner!.events[0]?.linkId).toBeUndefined()
  await ui.getByRole("button", { name: "메모", exact: true }).click()
  await expect(ui.locator(".note-card")).toContainText("백업 메모")
  const website = await context.newPage()
  await website.goto("https://www.jobkorea.co.kr/Search?stext=react")
  const cdp = await context.newCDPSession(website), worlds: { id: number; name: string; origin: string }[] = []
  cdp.on("Runtime.executionContextCreated", event => worlds.push(event.context))
  await cdp.send("Runtime.enable")
  const world = () => worlds.find(value => value.name.includes(extensionId) || value.origin === `chrome-extension://${extensionId}`)
  await expect.poll(() => world()?.id).toBeTruthy()
  const visible = await cdp.send("Runtime.evaluate", { contextId: world()!.id, expression: 'chrome.runtime.sendMessage({type:"snapshot"})', awaitPromise: true, returnByValue: true })
  expect(visible.result.value.data.planner).toBeUndefined()
  for (const request of [
    { type: "note_save", note: { ...note, id: crypto.randomUUID(), linkId: undefined }, dataGeneration: restored.dataGeneration },
    { type: "planner_remove", kind: "note", id: detached.planner!.notes[0]!.id, revision: detached.planner!.notes[0]!.revision, dataGeneration: restored.dataGeneration }
  ]) {
    const denied = await cdp.send("Runtime.evaluate", { contextId: world()!.id, expression: `chrome.runtime.sendMessage(${JSON.stringify(request)})`, awaitPromise: true, returnByValue: true })
    expect(denied.result.value.ok).toBe(false)
  }
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).planner!.notes).toHaveLength(1)
  await cdp.detach()
})

async function rpc<T = unknown>(ui: Page, request: Request): Promise<T> {
  const response = await ui.evaluate(async payload => chrome.runtime.sendMessage(payload), request) as Envelope<T>
  if (!response.ok) throw new Error(response.error)
  return response.data
}
async function enableHistoryAuto(ui: Page) {
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, historyAutoCollect: true } })
}
async function setup(ui: Page, consent = true, autoRecord = false) {
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, autoRecord, historyAutoCollect: autoRecord, consent: { saramin: consent, jobkorea: consent, wanted: consent, remember: consent }, profiles: { saramin: fixtureProfile("saramin"), jobkorea: fixtureProfile("jobkorea") } } })
}
async function pageMessage<T>(ui: Page, url: string, type: string): Promise<Envelope<T>> {
  return ui.evaluate(async ({ url, type }) => {
    const tabs = await chrome.tabs.query({ url })
    return chrome.tabs.sendMessage(tabs[0]!.id!, { type })
  }, { url, type })
}
async function open(context: BrowserContext, platform: string, kind: string) {
  const page = await context.newPage()
  await page.goto(`https://www.${platform}.co.kr/__todaystart/${kind}`)
  await expect(page.locator("h1")).toBeVisible()
  return page
}
async function sync(ui: Page, page: Page) {
  await expect.poll(async () => {
    try { return (await pageMessage(ui, page.url(), "GET_PAGE")).ok } catch { return false }
  }).toBe(true)
  const result = await pageMessage<{ collected: number }>(ui, page.url(), "SYNC_PAGE")
  expect(result.ok, JSON.stringify(result)).toBe(true)
  return result.ok ? result.data : undefined
}
async function count(ui: Page) { return (await rpc<Snapshot>(ui, { type: "snapshot" })).records.length }

test("MV3 확장 프로그램 로드, 최소 권한, 초기 관리 화면과 팝업", async ({ ui, context, extensionId }) => {
  const manifest = await ui.evaluate(() => chrome.runtime.getManifest())
  expect(manifest.name).toBe("오늘시작")
  expect(manifest.manifest_version).toBe(3)
  expect(manifest.permissions).toEqual(["storage", "activeTab"])
  expect(manifest.host_permissions).toEqual(["https://www.saramin.co.kr/*", "https://www.jobkorea.co.kr/*", "https://www.wanted.co.kr/*", "https://profile.rememberapp.co.kr/*", "https://career.rememberapp.co.kr/*"])
  expect(manifest.content_scripts?.every(c => !c.matches?.includes("<all_urls>"))).toBe(true)
  const main = manifest.content_scripts?.filter(c => "world" in c && c.world === "MAIN")
  expect(main).toHaveLength(1)
  expect(main?.[0]).toMatchObject({ all_frames: true, run_at: "document_start", matches: ["https://www.saramin.co.kr/zf_user/member/apply*", "https://www.jobkorea.co.kr/Recruit/OnPass*", "https://www.jobkorea.co.kr/Recruit/GI_Read/*", "https://www.jobkorea.co.kr/Search*", "https://www.jobkorea.co.kr/Recruit/JobList*"] })
  await expect(ui.getByRole("heading", { name: "지원 기록 업데이트", exact: true })).toBeVisible()
  await ui.screenshot({ path: "test-results/options-empty.png", fullPage: true })
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 400, height: 600 })
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.getByRole("heading", { name: "지원 기록", exact: true })).toBeVisible()
  await expect(popup.getByRole("button", { name: "+ 직접 추가", exact: true })).toBeInViewport()
  await expect(popup.getByRole("button", { name: "대시보드 열기", exact: true })).toBeInViewport()
  await expect(popup.getByRole("button", { name: "대시보드 열기", exact: true })).toHaveClass(/btn/)
  await expect(popup.getByRole("link", { name: "사람인 지원 기록 가져오기" })).toHaveAttribute("href", "https://www.saramin.co.kr/zf_user/persons/apply-status-list")
  await expect(popup.getByRole("link", { name: "잡코리아 지원 기록 가져오기" })).toHaveAttribute("href", "https://www.jobkorea.co.kr/User/ApplyMng?Page=1")
  await expect(popup.getByRole("link", { name: "원티드 지원 기록 가져오기" })).toHaveAttribute("href", "https://www.wanted.co.kr/status/applications/applied?q&start_date=&end_date=&page=1&offset=0&limit=10")
  await expect(popup.getByRole("link", { name: "리멤버 지원 기록 가져오기" })).toHaveAttribute("href", "https://profile.rememberapp.co.kr/applies")
  await expect.poll(() => popup.locator(".platform-logo").evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
  await expect(popup.locator(".popup-sites .state-dot,.popup-sites .site-monogram")).toHaveCount(0)
  await expect(popup.getByText("YOUR NEXT CHAPTER")).toHaveCount(0)
  await expect(popup.getByText("현재 페이지 확인")).toHaveCount(0)
  await popup.screenshot({ path: "test-results/popup.png", fullPage: true })
  const opened = context.waitForEvent("page")
  await popup.getByRole("button", { name: "대시보드 열기", exact: true }).click()
  const dashboard = await opened
  await expect(dashboard).toHaveURL(/options.html#overview$/)
  await expect(dashboard.getByRole("heading", { name: "여러 곳에 남긴 지원 기록을 한곳에서 확인해요", exact: true })).toBeVisible()
})

test("원티드 20초 지연 로딩: 대기 안내 → 수집 중 → 완료, 열린 팝업 자동 갱신 (합성 DOM)", async ({ ui, context, extensionId }) => {
  await enableHistoryAuto(ui)
  const url = "https://www.wanted.co.kr/status/applications/applied?page=1&offset=0&limit=10"
  await context.route(url, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<h1>합성 지연 로딩</h1><div id="shell">불러오는 중</div>' }))
  const history = await context.newPage(); await history.goto(url)
  await expect(history.locator("todaystart-collection")).toContainText("지원 목록 불러오는 중")
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).reports.wanted?.code).toBe("loading")
  await expect(ui.getByText("목록 확인 필요 · 사이트에서 다시 시도해 주세요.")).toHaveCount(0)
  const popup = await context.newPage(); await popup.setViewportSize({ width: 400, height: 600 })
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await history.bringToFront(); await popup.reload()
  await expect(popup.locator(".context-title")).toHaveText("지원 목록 불러오는 중")
  await popup.getByRole("button", { name: "조회 기간 전체 가져오기" }).click()
  await expect(history.locator("todaystart-collection")).toContainText("원티드 지원 기록 가져오는 중")
  await expect(popup.getByRole("heading", { name: "원티드 · 지원 기록 가져오는 중", exact: true })).toBeVisible()
  await history.screenshot({ path: "test-results/collection-waiting.png", fullPage: true })
  await history.evaluate(() => { setTimeout(() => {
    const main = document.createElement("main")
    main.innerHTML = '<table><thead><tr><th>기업명</th><th>공고명</th><th>지원일</th><th>지원상태</th></tr></thead><tbody><tr><td>지연 로딩 가상기업</td><td><a href="/wd/22942">개발자</a></td><td>2026.10.19</td><td>지원 완료</td></tr></tbody></table><nav aria-label="페이지"><strong aria-current="page">1</strong><button aria-label="다음 페이지" disabled>다음</button></nav>'
    document.querySelector("#shell")!.replaceWith(main)
  }, 20500) })
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 30000 }).toBe("completed")
  expect(await count(ui)).toBe(1)
  await expect(history.locator("todaystart-collection")).toContainText("원티드 지원 기록 수집 완료")
  await expect(history.locator("todaystart-collection")).toContainText("1페이지")
  await expect(popup.getByRole("heading", { name: "원티드 · 가져오기 완료", exact: true })).toBeVisible()
  await expect(popup.locator(".context-title")).toHaveText("지원 현황에서 가져오기")
  await expect(popup.getByRole("button", { name: "현재 목록 가져오기", exact: true })).toBeEnabled()
  await history.screenshot({ path: "test-results/collection-complete.png", fullPage: true })
  const opened = context.waitForEvent("page")
  await history.locator("todaystart-collection").getByRole("button", { name: "대시보드 열기", exact: true }).click()
  await expect(await opened).toHaveURL(/options.html#overview$/)
  await history.locator("todaystart-collection").getByRole("button", { name: "수집 안내 닫기" }).click()
  await expect(history.locator("todaystart-collection")).toHaveCount(0)
})

test("자동 기록을 꺼도 요청한 현재 목록은 로딩 후 저장하고 페이지에 완료를 표시", async ({ ui, context }) => {
  await setup(ui, true, false)
  const url = "https://www.wanted.co.kr/status/applications/applied?page=1&offset=0&limit=10"
  await context.route(url, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<main aria-busy="true"><h1>합성 로딩</h1></main>' }))
  const history = await context.newPage(); await history.goto(url)
  await sync(ui, history)
  await expect(history.locator("todaystart-collection")).toContainText("지원 목록 불러오는 중")
  await history.evaluate(() => {
    const main = document.querySelector("main")!; main.removeAttribute("aria-busy")
    main.innerHTML = '<ul><li><a href="/company/79">가상기업</a><a href="/wd/22942">개발자</a><p>지원일 2026.10.19</p><span>지원 완료</span></li></ul>'
  })
  await expect.poll(() => count(ui)).toBe(1)
  await expect(history.locator("todaystart-collection")).toContainText("현재 목록 수집 완료")
  await expect(history.locator("todaystart-collection")).toContainText("1건 추가")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.settings.autoRecord).toBe(false)
  await rpc(ui, { type: "settings", settings: { ...snapshot.settings, theme: "dark" } })
  await expect(history.locator("todaystart-collection")).toHaveAttribute("data-theme", "dark")
  await expect(history.locator("todaystart-collection section")).toHaveCSS("background-color", "rgb(24, 24, 27)")
  await expect(history.locator("todaystart-collection strong")).toHaveCSS("color", "rgb(250, 250, 250)")
  await history.screenshot({ path: "test-results/collection-dark.png", fullPage: true })
})

test("지원 현황 화면에서 수집 중지, 다른 탭에는 해당 작업 상태를 표시하지 않음", async ({ ui, context }) => {
  await enableHistoryAuto(ui)
  const url = "https://www.wanted.co.kr/status/applications/applied?page=1&offset=0&limit=10"
  await context.route(url, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<main aria-busy="true"><h1>합성 로딩</h1></main>' }))
  const history = await context.newPage(); await history.goto(url)
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), url)
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  await expect(history.locator("todaystart-collection")).toContainText("원티드 지원 기록 가져오는 중")
  const other = await context.newPage(); await other.goto(url)
  await expect(other.locator("todaystart-collection")).toContainText("지원 목록 불러오는 중")
  await expect(other.locator("todaystart-collection").getByRole("button", { name: "수집 중지" })).toHaveCount(0)
  await history.locator("todaystart-collection").getByRole("button", { name: "수집 중지", exact: true }).click()
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status).toBe("stopped")
  await expect(history.locator("todaystart-collection")).toContainText("원티드 지원 기록 수집 중지")
  expect(await count(ui)).toBe(0)
})

test("팝업에서 직접 추가 → 저장·검색·원티드 공고 경고·수정·복원·삭제", async ({ ui, context, extensionId }) => {
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 400, height: 600 })
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  const opened = context.waitForEvent("page")
  await popup.getByRole("button", { name: "+ 직접 추가", exact: true }).click()
  const manager = await opened
  await expect(manager).toHaveURL(/options.html#add$/)
  const dialog = manager.getByRole("dialog", { name: "지원 기록 직접 추가" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("기업명", { exact: true }).fill("원티드랩")
  await dialog.getByLabel("지원 직무", { exact: true }).fill("직접 지원한 개발자")
  await dialog.getByLabel("지원 날짜", { exact: true }).fill("2026-10-19")
  await dialog.getByLabel("공고 주소", { exact: false }).fill("https://careers.example.com/jobs/123?token=private")
  await manager.screenshot({ path: "test-results/manual-add-light.png", fullPage: true })
  await dialog.getByRole("button", { name: "기록 추가", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(manager.getByText("지원 기록을 추가했습니다.")).toBeVisible()
  await expect(manager.locator("td.job-cell")).toHaveText("직접 지원한 개발자")
  await expect(manager.locator("tbody").getByText("기업 홈페이지", { exact: true })).toBeVisible()
  await expect(manager.getByRole("link", { name: "직접 지원한 개발자" })).toHaveAttribute("href", "https://careers.example.com/jobs/123")
  await manager.getByRole("button", { name: "원티드 0", exact: true }).click()
  await expect(manager.locator("tbody tr")).toHaveCount(0)
  await manager.getByRole("button", { name: "직접 지원 1", exact: true }).click()
  await expect(manager.locator("tbody tr")).toHaveCount(1)
  const search = manager.getByRole("textbox", { name: "기업명 또는 직무 검색" })
  await search.fill("직접 지원한")
  await expect(manager.locator("tbody tr")).toHaveCount(1)
  await search.fill("없는 직무")
  await expect(manager.locator("tbody tr")).toHaveCount(0)
  await search.clear()
  const url = publicMetadata.wantedDetail.sourceUrl
  await context.route(url, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("public/wantedDetail.html") }))
  const job = await context.newPage(); await job.goto(url)
  await expect(job.locator("todaystart-warning")).toHaveCount(1)
  await expect(job.getByText("기업 홈페이지 · 2026-10-19 · 지원 완료")).toBeVisible()
  await manager.getByRole("button", { name: /직접 지원한 개발자 수정/ }).click()
  await manager.getByLabel("지원 직무", { exact: true }).fill("수정한 직접 지원")
  await manager.getByRole("button", { name: "변경 저장" }).click()
  const backup = await rpc<{ records: unknown[] }>(manager, { type: "backup" })
  expect(backup.records).toHaveLength(1)
  await rpc(manager, { type: "restore", backup })
  await rpc(manager, { type: "restore", backup })
  expect(await count(manager)).toBe(1)
  await manager.getByRole("button", { name: /수정한 직접 지원 삭제/ }).click()
  await manager.getByRole("button", { name: "기록 삭제", exact: true }).click()
  await expect.poll(() => count(manager)).toBe(0)
  await expect(job.locator("todaystart-warning")).toHaveCount(0)
  await manager.getByRole("button", { name: "설정", exact: true }).click()
  await manager.getByRole("button", { name: "다크", exact: true }).click()
  await manager.getByRole("button", { name: "지원 기록 0", exact: true }).click()
  await manager.getByRole("button", { name: "+ 직접 추가", exact: true }).click()
  await expect(manager.locator("html")).toHaveAttribute("data-theme", "dark")
  await expect(manager.getByRole("dialog")).toBeVisible()
  await manager.screenshot({ path: "test-results/manual-add-dark.png", fullPage: true })
  await manager.getByRole("button", { name: "취소", exact: true }).click()
})

test("원티드 지원 현황: page·offset 이동, 조회 조건 유지, 반복 수집 병합 (합성 DOM)", async ({ ui, context }) => {
  await enableHistoryAuto(ui)
  const address = (page: number) => `https://www.wanted.co.kr/status/applications/applied?q&start_date=&end_date=&page=${page}&offset=${(page-1)*10}&limit=10`
  const visited: string[] = []
  await context.route("https://www.wanted.co.kr/status/applications/applied?*", route => {
    const url = route.request().url(); visited.push(url)
    const page = Number(new URL(url).searchParams.get("page"))
    const nav = page === 1 ? `<a rel="next" href="${address(2)}">다음 페이지</a>` : '<button aria-label="다음 페이지" disabled>다음</button>'
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<main><h1>합성 원티드 지원 현황</h1><table><thead><tr><th>기업명</th><th>공고명</th><th>지원일</th><th>지원상태</th></tr></thead><tbody><tr><td>가상 원티드 기업 ${page}</td><td><a href="/wd/${22940+page}">개발자 ${page}</a></td><td>2026.10.${10+page}</td><td>지원 완료</td></tr></tbody></table><nav aria-label="페이지"><strong aria-current="page">${page}</strong>${nav}</nav></main>` })
  })
  const history = await context.newPage(); await history.goto(address(1))
  await expect.poll(() => count(ui)).toBe(1)
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), address(1))
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 25000 }).toBe("completed")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.records).toHaveLength(2)
  expect(snapshot.records.every(record => record.platform === "wanted")).toBe(true)
  expect(snapshot.historyRun).toMatchObject({ platform: "wanted", pages: 2 })
  await history.goto(address(1)); await sync(ui, history)
  expect(await count(ui)).toBe(2)
  expect(visited.some(url => url.includes("page=2&offset=10&limit=10"))).toBe(true)
})

test("수집 기본값 켜짐, 사용자 끄기 유지, 라이트·다크·시스템 테마", async ({ ui, context, extensionId }) => {
  const first = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(first.settings.consent).toEqual({ saramin: true, jobkorea: true, wanted: true, remember: true })
  expect(first.settings.autoRecord).toBe(true)
  await ui.getByRole("button", { name: "설정", exact: true }).click()
  await expect(ui.getByRole("switch", { name: "사람인 자동 수집" })).toBeChecked()
  await expect(ui.getByRole("switch", { name: "잡코리아 자동 수집" })).toBeChecked()
  await ui.getByRole("switch", { name: "사람인 자동 수집" }).click()
  await expect(ui.getByRole("switch", { name: "사람인 자동 수집" })).not.toBeChecked()
  await ui.reload()
  await expect(ui.getByRole("switch", { name: "사람인 자동 수집" })).not.toBeChecked()
  await ui.getByRole("button", { name: "다크", exact: true }).click()
  await expect(ui.locator("html")).toHaveAttribute("data-theme", "dark")
  await expect.poll(() => ui.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe("rgb(9, 9, 11)")
  await ui.screenshot({ path: "test-results/settings-dark.png", fullPage: true })
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 400, height: 600 })
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.locator("html")).toHaveAttribute("data-theme", "dark")
  await expect(popup.locator(".popup")).toHaveCSS("background-color", "rgb(24, 24, 27)")
  await popup.screenshot({ path: "test-results/popup-dark.png" })
  await ui.getByRole("button", { name: "시스템", exact: true }).click()
  await ui.emulateMedia({ colorScheme: "dark" })
  await expect.poll(() => ui.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe("rgb(9, 9, 11)")
  await ui.emulateMedia({ colorScheme: "light" })
  await expect.poll(() => ui.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe("rgb(250, 250, 250)")
  await ui.getByRole("button", { name: "라이트", exact: true }).click()
  await ui.emulateMedia({ colorScheme: "dark" })
  await expect.poll(() => ui.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe("rgb(250, 250, 250)")
  await expect(popup.locator("html")).toHaveAttribute("data-theme", "light")
})

test("이전 설치의 기본 꺼짐 설정을 한 번만 켜짐으로 이전", async ({ ui }) => {
  const current = await rpc<Snapshot>(ui, { type: "snapshot" })
  const { settingsVersion, theme, ...legacy } = current.settings
  await ui.evaluate(settings => chrome.storage.local.set({ settings }), { ...legacy, listingWarnings: false, consent: { saramin: false, jobkorea: false } })
  const migrated = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(migrated.settings).toMatchObject({ settingsVersion: 3, theme: "system", listingWarnings: false, consent: { saramin: true, jobkorea: true, wanted: true } })
  await rpc(ui, { type: "settings", settings: { ...migrated.settings, consent: { ...migrated.settings.consent, saramin: false, jobkorea: true, wanted: true } } })
  await ui.reload()
  const afterReload = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(afterReload.settings.consent.saramin).toBe(false)
})

test("실제 선택자 미검증 상태에서는 수집하지 않는다", async ({ ui, context }) => {
  const page = await open(context, "saramin", "history")
  const result = await pageMessage(ui, page.url(), "SYNC_PAGE")
  expect(result.ok).toBe(false)
  expect(await count(ui)).toBe(0)
  await ui.getByRole("button", { name: "설정", exact: true }).click()
  await ui.getByText("사이트 수집 진단", { exact: true }).click()
  await expect(ui.getByText("사람인 · 기본 수집")).toBeVisible()
})

test("잡코리아 /User/ApplyMng 감지와 인식 불가능한 구조에서 기존 기록 보존", async ({ ui, context }) => {
  const url = "https://www.jobkorea.co.kr/User/ApplyMng"
  // The route is user-provided; the HTML is deliberately a Mock, not a claim
  // that the authenticated site's selectors have been verified.
  await context.route(url, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("jobkorea-history.html") }))
  const page = await context.newPage()
  await page.goto(url)
  await expect.poll(async () => {
    try {
      const response = await pageMessage<PageState>(ui, url, "GET_PAGE")
      return response.ok && response.data.kind
    } catch { return undefined }
  }).toBe("history")
  const state = await pageMessage<PageState>(ui, url, "GET_PAGE")
  expect(state.ok && state.data.profileReady).toBe(true)
  expect((await pageMessage(ui, url, "SYNC_PAGE")).ok).toBe(true)
  expect(await count(ui)).toBe(0)
  await setup(ui)
  expect((await sync(ui, page))?.collected).toBe(2)
  expect(await count(ui)).toBe(2)
})

test("선택자 파일 없는 기본 수집, 재수집 중복 방지, 팝업 진단 파일", async ({ ui, context, extensionId }) => {
  await enableHistoryAuto(ui)
  const url = "https://www.jobkorea.co.kr/User/ApplyMng"
  await context.route(url, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("semantic-history.html") }))
  const page = await context.newPage()
  await page.goto(url)
  await expect.poll(() => count(ui)).toBe(2)
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).settings.profiles).toEqual({})
  await page.reload()
  await sync(ui, page)
  expect(await count(ui)).toBe(2)
  const records = (await rpc<Snapshot>(ui, { type: "snapshot" })).records
  expect(records.find(r => r.companyName === "가상기업 알파")?.status).toBe("applied")
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 400, height: 600 })
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.bringToFront()
  await popup.reload()
  await expect(popup.getByRole("button", { name: "현재 목록 가져오기" })).toBeVisible()
  await page.evaluate(() => {
    const footer = document.createElement("footer")
    footer.innerHTML = '<div class="custom-pagination"><span><em>1</em></span><span><a href="javascript:move(2,\'SECRET_HANDLER\')">2</a></span><button onclick="SECRET_HANDLER()">다음 페이지</button></div>'
    document.body.append(footer)
  })
  const [download] = await Promise.all([
    popup.waitForEvent("download"),
    popup.getByRole("button", { name: "화면 진단 파일 저장" }).click()
  ])
  const { readFile } = await import("node:fs/promises")
  const diagnostic = JSON.parse((await readFile((await download.path())!, "utf8")).replace(/^\uFEFF/, ""))
  expect(diagnostic.format).toBe("todaystart-history-structure-v1")
  expect(JSON.stringify(diagnostic)).not.toContain("TEST_PRIVATE_ACCOUNT")
  expect(JSON.stringify(diagnostic)).not.toContain("가상기업 알파")
  expect(JSON.stringify(diagnostic)).not.toContain("SECRET_HANDLER")
  expect(diagnostic.navigationCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ number: 2, linkKind: "script", inPageContext: true })]))
  expect(diagnostic.html).toContain("<table>")
})

test("사람인 페이지 경로/쿼리 충돌, 첫 페이지부터 전체 수집, 팝업을 닫아도 진행", async ({ ui, context, extensionId }) => {
  await enableHistoryAuto(ui)
  const suffix = "pageCount=20&search_period=1&start_date=2026-09-19&end_date=2026-10-19&read_status=tot&order_type=update"
  const address = (page: number) => `https://www.saramin.co.kr/zf_user/persons/apply-status-list/page/${page}?page=${page === 1 ? 2 : page === 2 ? 1 : page}&${suffix}`
  const requested: string[] = []
  await context.route("https://www.saramin.co.kr/zf_user/persons/apply-status-list/**", route => {
    const url = route.request().url(), page = Number(new URL(url).pathname.match(/\/page\/(\d+)/)![1])
    requested.push(url)
    const pagination = `<nav aria-label="페이지">${[1,2,3].map(n => n === page ? `<strong aria-current="page">${n}</strong>` : `<a href="${address(n)}">${n}</a>`).join("")}${page < 3 ? `<a rel="next" href="${address(page+1)}">다음 페이지</a>` : '<button aria-label="다음 페이지" disabled>다음</button>'}</nav>`
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><main><h1>합성 지원 현황</h1><table><thead><tr><th>기업명</th><th>공고명</th><th>지원일</th><th>지원상태</th></tr></thead><tbody><tr><td>가상기업 ${page}</td><td><a href="/zf_user/jobs/relay/view?rec_idx=${12345670+page}">가상직무 ${page}</a></td><td>2026.10.${10+page}</td><td>미열람</td></tr></tbody></table>${pagination}</main>` })
  })
  const history = await context.newPage()
  await history.goto(address(2))
  await expect.poll(() => count(ui)).toBe(1)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await history.bringToFront(); await popup.reload()
  await popup.getByRole("button", { name: "조회 기간 전체 가져오기" }).click()
  await popup.close()
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 25000 }).toBe("completed")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.records).toHaveLength(3)
  expect(snapshot.historyRun).toMatchObject({ pages: 3, processed: 3, skipped: 0 })
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await expect(ui.locator(".records-imports .import-source-copy strong svg")).toHaveCount(1)
  await ui.screenshot({ path: "test-results/pagination-complete.png", fullPage: true, animations: "disabled" })
  expect(requested.map(url => Number(new URL(url).pathname.match(/\/page\/(\d+)/)![1]))).toEqual([2,1,2,3])
  for (const url of requested) expect(new URL(url).searchParams.get("start_date")).toBe("2026-09-19")
})

test("시작 체크리스트 클릭으로 사이트를 열고 전체 수집을 시작한다", async ({ ui, context }) => {
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await context.route("https://www.jobkorea.co.kr/User/ApplyMng?Page=1", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("semantic-history.html").replace("</main>", '<nav aria-label="페이지"><span>1</span><button aria-label="다음 페이지" disabled>다음</button></nav></main>') }))
  // Chrome-created tabs can issue their initial request before Playwright has
  // attached routing. Only the initial navigation is driven by the test; tab
  // creation, the UI click, runtime request, and collection runner are real.
  await ui.evaluate(() => {
    const create = chrome.tabs.create.bind(chrome.tabs)
    chrome.tabs.create = async properties => {
      const tab = await create({ ...properties, url: "about:blank" })
      await new Promise<void>(resolve => {
        const updated = (id: number, change: chrome.tabs.OnUpdatedInfo, current: chrome.tabs.Tab) => {
          if (id === tab.id && change.status === "complete" && current.url === properties.url) { chrome.tabs.onUpdated.removeListener(updated); resolve() }
        }
        chrome.tabs.onUpdated.addListener(updated)
      })
      return chrome.tabs.get(tab.id!)
    }
  })
  const created = context.waitForEvent("page")
  await ui.getByRole("button", { name: "잡코리아 지원 기록 가져오기", exact: true }).click()
  const history = await created
  await history.goto("https://www.jobkorea.co.kr/User/ApplyMng?Page=1")
  await expect(history).toHaveURL("https://www.jobkorea.co.kr/User/ApplyMng?Page=1")
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 20000 }).toBe("completed")
  expect(await count(ui)).toBe(2)
})

test("20개 중 8개만 읽힌 합성 목록은 누락 12건을 표시하고 전체 완료로 표시하지 않는다", async ({ ui, context }) => {
  await enableHistoryAuto(ui)
  const url = "https://www.jobkorea.co.kr/User/ApplyMng?Page=1"
  const rows = Array.from({ length: 20 }, (_, index) => `<tr><td>합성 기업 ${index}</td><td><a href="/Recruit/GI_Read/${72000000+index}">개발자 ${index}</a></td><td>${index < 8 ? "2026.10.19" : "날짜 확인 필요"}</td><td>지원 완료</td></tr>`).join("")
  await context.route(url, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<main><table><thead><tr><th>기업명</th><th>공고명</th><th>지원일</th><th>지원상태</th></tr></thead><tbody>${rows}</tbody></table><nav aria-label="페이지"><span>1</span><button aria-label="다음 페이지" disabled>다음</button></nav></main>` }))
  const history = await context.newPage(); await history.goto(url)
  await expect.poll(() => count(ui)).toBe(8)
  await expect(history.locator("todaystart-collection")).toContainText("현재 목록 일부 수집")
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), url)
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 15000 }).toBe("stopped")
  await expect(history.locator("todaystart-collection")).toContainText("12건은 읽지 못했습니다")
  await expect(history.locator("todaystart-collection")).toContainText("8건 읽음")
  const diagnostic = await pageMessage<{ parsing: { recognized: number; skipped: number }; tables: { rows: number }[] }>(ui, url, "HISTORY_DIAGNOSTICS")
  expect(diagnostic.ok && diagnostic.data.parsing).toMatchObject({ recognized: 8, skipped: 12 })
  expect(diagnostic.ok && diagnostic.data.tables[0]?.rows).toBe(20)
})

test("잡코리아 # 자리표시자·JavaScript 링크: 실제 Page=2로 이동하고 20개 행씩 수집 (합성 DOM)", async ({ ui, context }) => {
  await enableHistoryAuto(ui)
  test.setTimeout(90000)
  const base = "https://www.jobkorea.co.kr/User/ApplyMng?From_Dt=2026-07-21&To_Dt=2026-10-19&ReadStat=0&Page="
  const visited: string[] = []
  await context.route("https://www.jobkorea.co.kr/User/ApplyMng?*", route => {
    const url = route.request().url(); visited.push(url)
    const page = Number(new URL(url).searchParams.get("Page"))
    const rows = Array.from({ length: 20 }, (_, index) => `<tr><td>합성 기업 ${page}-${index}</td><td>${index < 8 ? `<a href="/Recruit/GI_Read/${71000000+page*100+index}">개발자 ${page}-${index}</a>` : `마감된 공고 직무 ${page}-${index}`}</td><td>2026.10.19</td><td>지원 완료</td></tr>`).join("")
    const pages = page === 1 ? '<span>1</span><a href="javascript:unavailablePageFunction(2)">2</a>' : '<a href="javascript:unavailablePageFunction(1)">1</a><span>2</span><button aria-label="다음 페이지" disabled>다음</button>'
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<a href="#">다음</a><main><h1>합성 잡코리아 지원 현황</h1><table><thead><tr><th>기업명</th><th>공고명</th><th>지원일</th><th>지원상태</th></tr></thead><tbody>${rows}</tbody></table><nav aria-label="페이지">${pages}</nav></main>` })
  })
  const history = await context.newPage(); await history.goto(base + "1#")
  await expect.poll(() => count(ui)).toBe(20)
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url: url.split("#")[0] }), history.url())
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 60000 }).toBe("completed")
  await expect(history).toHaveURL(base + "2")
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.records).toHaveLength(40)
  expect(snapshot.historyRun).toMatchObject({ pages: 2, processed: 40, skipped: 0 })
  expect(visited.map(url => new URL(url).searchParams.get("Page"))).toEqual(["1", "2"])
  expect(visited.every(url => new URL(url).searchParams.get("From_Dt") === "2026-07-21")).toBe(true)
})

for (const start of [1, 2]) {
  test(`사람인 URL 고정: ${start}페이지에서 시작, 실제 버튼으로 첫 페이지부터 3페이지 수집 (합성 DOM)`, async ({ ui, context }) => {
    await enableHistoryAuto(ui)
    test.setTimeout(90000)
    const url = "https://www.saramin.co.kr/zf_user/persons/apply-status-list"
    let requests = 0
    await context.route(url, route => { requests++; return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<main><h1>합성 사람인 지원 현황</h1></main>' }) })
    const history = await context.newPage(); await history.goto(url)
    await history.evaluate(initial => {
      const main = document.querySelector("main")!
      const visited: number[] = []
      const render = (page: number) => {
        visited.push(page); main.dataset.visited = visited.join(",")
        main.removeAttribute("aria-busy")
        const rows = Array.from({ length: 2 }, (_, index) => `<tr><td>합성 사람인 기업 ${page}-${index}</td><td><a href="/zf_user/jobs/relay/view?rec_idx=${70000000 + page * 10 + index}">가상 개발자 ${page}-${index}</a></td><td>2026.10.19</td><td>지원 완료</td></tr>`).join("")
        const marker = initial === 1 ? "strong" : "span"
        const numbers = [1, 2, 3].map(number => number === page ? `<${marker}>${number}</${marker}>` : `<a href="javascript:testPage(${number})" data-page="${number}">${number}</a>`).join("")
        const pagination = initial === 1 ? `<div>${numbers}${page === 3 ? '<button aria-label="다음 페이지" disabled>다음</button>' : ""}</div>` : `<nav aria-label="페이지">${numbers}${page === 3 ? '<button aria-label="다음 페이지" disabled>다음</button>' : ""}</nav>`
        main.innerHTML = `<h1>합성 사람인 지원 현황</h1><table><thead><tr><th>기업명</th><th>공고명</th><th>지원일</th><th>지원상태</th></tr></thead><tbody>${rows}</tbody></table>${pagination}`
        main.querySelectorAll<HTMLElement>("[data-page]").forEach(button => button.addEventListener("click", event => {
          event.preventDefault(); main.setAttribute("aria-busy", "true")
          setTimeout(() => render(Number(button.dataset.page)), 600)
        }))
      }
      render(initial)
    }, start)
    await expect.poll(() => count(ui)).toBe(2)
    const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), url)
    await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 60000 }).toBe("completed")
    const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    expect(snapshot.records).toHaveLength(6)
    expect(snapshot.historyRun).toMatchObject({ platform: "saramin", pages: 3, processed: 6, scope: "현재 조회 조건 · 3페이지" })
    expect(history.url()).toBe(url)
    expect(requests).toBe(1)
    await expect(history.locator("main")).toHaveAttribute("data-visited", start === 2 ? "2,1,2,3" : "1,2,3")
    await expect(history.locator("todaystart-collection")).toContainText("사람인 지원 기록 수집 완료")
    if (start === 1) await history.screenshot({ path: "test-results/saramin-same-url-complete.png", fullPage: true })
  })
}

for (const start of [undefined, 1, 2]) {
  test(`잡코리아 Page=${start ?? "없음"}: 현재 번호 표시 없이 첫 페이지부터 수집, 날짜·상태 필터 보존 (합성 DOM)`, async ({ ui, context }) => {
    await enableHistoryAuto(ui)
    const base = "https://www.jobkorea.co.kr/User/ApplyMng?From_Dt=2026-07-21&To_Dt=2026-10-19&StatusStat=0&Order_Apply=0&IngStat=0&ReadStat=0"
    const address = (page?: number) => base + (page ? `&Page=${page}` : "")
    const visited: string[] = []
    await context.route("https://www.jobkorea.co.kr/User/ApplyMng?*", route => {
      const url = route.request().url(); visited.push(url)
      const page = Number(new URL(url).searchParams.get("Page") || 1)
      const rows = Array.from({ length: 8 }, (_, index) => `<tr><td>합성 기업 ${page}-${index}</td><td><a href="/Recruit/GI_Read/${70000000 + page * 10 + index}">가상 개발자 ${page}-${index}</a></td><td>2026.10.19</td><td>지원 완료</td></tr>`).join("")
      const pagination = page === 1 ? `<span>1</span><a href="${address(2)}">2</a>` : `<a href="${address(1)}">1</a><span>2</span><button aria-label="다음 페이지" disabled>다음</button>`
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<main><h1>합성 잡코리아 지원 현황</h1><table><thead><tr><th>기업명</th><th>공고명</th><th>지원일</th><th>지원상태</th></tr></thead><tbody>${rows}</tbody></table><nav aria-label="페이지">${pagination}</nav></main>` })
    })
    const history = await context.newPage(); await history.goto(address(start))
    await expect.poll(() => count(ui)).toBe(8)
    const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), address(start))
    await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
    await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status, { timeout: 30000 }).toBe("completed")
    const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    expect(snapshot.records).toHaveLength(16)
    expect(snapshot.historyRun).toMatchObject({ platform: "jobkorea", pages: 2, processed: 16, scope: "2026-07-21 ~ 2026-10-19 · 2페이지" })
    expect(visited.map(url => Number(new URL(url).searchParams.get("Page") || 1))).toEqual(start === 2 ? [2, 1, 2] : [1, 2])
    for (const url of visited) for (const [key, value] of new URL(base).searchParams) expect(new URL(url).searchParams.get(key)).toBe(value)
    await expect(history.locator("todaystart-collection")).toContainText("잡코리아 지원 기록 수집 완료")
    if (start === undefined) await history.screenshot({ path: "test-results/jobkorea-pagination-complete.png", fullPage: true })
  })
}

test("전체 수집 중지 후에는 새 페이지를 읽지 않고 기존 기록을 보존한다", async ({ ui, context }) => {
  await enableHistoryAuto(ui)
  const address = "https://www.jobkorea.co.kr/User/ApplyMng?page=1"
  await context.route("https://www.jobkorea.co.kr/User/ApplyMng?*", route => {
    const params = new URL(route.request().url()).searchParams
    const next = (params.get("Page") || params.get("page")) === "2"
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: next ? "<main>불러오는 중</main>" : fixture("semantic-history.html").replace("</main>", '<nav aria-label="페이지"><strong aria-current="page">1</strong><a rel="next" href="?page=2">다음 페이지</a></nav></main>') })
  })
  const history = await context.newPage(); await history.goto(address)
  await expect.poll(() => count(ui)).toBe(2)
  const tabs = await ui.evaluate(url => chrome.tabs.query({ url }), address)
  await rpc(ui, { type: "history_run", operation: "start", tabId: tabs[0]!.id! })
  // The runner checks DOM stability before/after merging and before advancing.
  // Allow those bounded polls to finish before testing the user's stop action.
  await expect(history).toHaveURL(/[?&]page=2/i, { timeout: 15000 })
  await ui.getByRole("button", { name: "중지", exact: true }).click()
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).historyRun?.status).toBe("stopped")
  expect(await count(ui)).toBe(2)
})

test("사람인 수집 → 잡코리아 경고, 다중 직무, 동적 카드, SPA, 새로고침", async ({ ui, context }) => {
  await setup(ui)
  const history = await open(context, "saramin", "history")
  expect((await sync(ui, history))?.collected).toBe(3)
  await sync(ui, history)
  expect(await count(ui)).toBe(3)
  const jobs = await open(context, "jobkorea", "jobs")
  await expect(jobs.locator("todaystart-warning")).toHaveCount(1)
  await jobs.locator("todaystart-warning summary").click()
  await expect(jobs.getByText("지원 직무: 백엔드 개발자")).toBeVisible()
  await expect(jobs.getByText("지원 직무: 프론트엔드 개발자")).toBeVisible()
  await expect(jobs.getByText("2026-10-10", { exact: false })).toBeVisible()
  await jobs.screenshot({ path: "test-results/cross-platform-warning.png", fullPage: true })
  await jobs.evaluate(() => {
    const card = document.querySelector(".j-card")!.cloneNode(true) as Element
    card.setAttribute("data-job", "new")
    document.querySelector("#j-recruit")!.append(card)
  })
  await expect(jobs.locator("todaystart-warning")).toHaveCount(2)
  await jobs.evaluate(() => document.querySelector(".j-card [data-field=company]")!.textContent = "다른기업")
  await expect(jobs.locator("todaystart-warning")).toHaveCount(1)
  await jobs.evaluate(() => { window.history.pushState({}, "", "/__todaystart/detail"); document.querySelectorAll("[data-field=company]").forEach(el => el.textContent = "헌터 협회") })
  await expect(jobs.locator("todaystart-warning")).toHaveCount(4)
  await expect(jobs.locator("todaystart-warning details[open]")).toHaveCount(4)
  await jobs.reload()
  await expect(jobs.locator("todaystart-warning")).toHaveCount(1)
  expect(await count(ui)).toBe(3)
  await ui.reload()
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await expect(ui.locator("td.job-cell").filter({ hasText: "백엔드 개발자" })).toBeVisible()
  await ui.screenshot({ path: "test-results/options-records.png", fullPage: true })
})

test("잡코리아 /Search 공개 목록: 사람인 지원 이력 경고", async ({ ui, context }) => {
  const sourceUrl = publicPostingPages.jobkoreaSearch.sourceUrl
  const synthetic = record({ platform: "saramin", sourceApplicationId: "test-jobkorea-search", companyName: "콴텍 주식회사", normalizedCompanyName: "콴텍", jobTitle: "로보어드바이저 개발자", status: "applied", evidence: "history_page" })
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [synthetic] } })
  await context.route(sourceUrl, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("public/jobkoreaSearch.html") }))
  const jobs = await context.newPage()
  await jobs.goto(sourceUrl)
  await expect(jobs.getByRole("link", { name: "[AI콴텍] 로보어드바이저 IRP 시스템 개발", exact: true })).toHaveAttribute("href", /\/Recruit\/GI_Read\/50183259(?:[/?#]|$)/)
  const warning = jobs.locator("todaystart-warning")
  await expect(warning).toHaveCount(1)
  await expect(warning.locator("summary")).toHaveText("오늘시작 · 사람인 지원 이력 있음")
  await expect(warning.locator("details[open]")).toHaveCount(0)
  await warning.locator("summary").click()
  await expect(warning).toContainText("사람인 · 2026-10-10 · 지원 완료")
  await expect(warning).toContainText("지원 직무: 로보어드바이저 개발자")
  const cards = jobs.locator('[data-sentry-component="CardJob"]')
  await expect(cards.nth(0).locator(":scope > todaystart-warning")).toHaveCount(1)
  await expect(cards.nth(1).locator(":scope > todaystart-warning")).toHaveCount(0)
  await cards.nth(0).screenshot({ path: "test-results/jobkorea-search-warning.png" })
  const page = await pageMessage<PageState>(ui, jobs.url(), "GET_PAGE")
  expect(page.ok && page.data).toMatchObject({ platform: "jobkorea", kind: "listing", matches: 1 })
  const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.settings.profiles).toEqual({})
  expect(snapshot.records).toHaveLength(1)
})

for (const mode of ["default", "legacy-profile", "stale-profile", "rerender"] as const) {
test(`잡코리아 검색 5페이지: 사람인 이력 경고 ${mode}`, async ({ ui, context }) => {
  const posting = searchPage5.expected[0]!
  const synthetic = record({ companyName: posting.companyName, normalizedCompanyName: posting.companyName, jobTitle: "검색 회귀 검증용 지원 직무", sourceApplicationId: "search-page5-test" })
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [synthetic] } })
  if (mode === "legacy-profile" || mode === "stale-profile") {
    const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    const profile = fixtureProfile("jobkorea")
    if (mode === "stale-profile") profile.listingPaths.push("/Search")
    await rpc(ui, { type: "settings", settings: { ...snapshot.settings, profiles: { jobkorea: profile } } })
  }
  await context.route(searchPage5.sourceUrl, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture("public/jobkoreaSearchPage5.html") }))
  const jobs = await context.newPage()
  await jobs.goto(searchPage5.sourceUrl)
  const warning = jobs.locator("todaystart-warning")
  await expect(warning).toHaveCount(1)
  await expect(warning.locator("summary")).toHaveText("오늘시작 · 사람인 지원 이력 있음")
  if (mode === "rerender") {
    await warning.evaluate(element => element.remove())
    await expect(warning).toHaveCount(1)
  }
  await warning.locator("summary").click()
  await expect(warning).toContainText(synthetic.jobTitle)
  await expect(warning).toContainText("2026-10-10")
  await expect(warning).toBeVisible()
  const cards = jobs.locator('[data-sentry-component="CardJob"]')
  await expect(cards).toHaveCount(20)
  await expect(cards.nth(0).locator(":scope > todaystart-warning")).toHaveCount(1)
  await expect(cards.nth(1).locator(":scope > todaystart-warning")).toHaveCount(0)
  if (mode === "default") await jobs.screenshot({ path: "test-results/jobkorea-search-page5-warning.png", fullPage: true })
})
}

test("잡코리아 검색: 빅링크의 같은 사이트 지원 이력을 다른 직무 공고에도 표시한다", async ({ ui, context }) => {
  const prior = record({ platform: "jobkorea", companyName: "주식회사 빅링크", normalizedCompanyName: "빅링크", jobTitle: "이전에 지원한 웹 개발자", sourceApplicationId: "biglink-test", sourceJobId: "70000001", companyIdentifier: "jobkorea:example", jobUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/70000001" })
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [prior] } })
  // Synthetic employer labels on a copy of the captured layout; no real
  // Biglink application, job ID, or user record is accessed or invented.
  const html = fixture("public/jobkoreaSearchPage5.html").replace("㈜마니테크</span>", "㈜빅링크</span>")
  await context.route(searchPage5.sourceUrl, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: html }))
  const jobs = await context.newPage()
  await jobs.goto(searchPage5.sourceUrl)
  const warning = jobs.locator("todaystart-warning")
  await expect(warning).toHaveCount(1)
  await expect(warning.locator("summary")).toHaveText("오늘시작 · 잡코리아 지원 이력 있음")
  const card = jobs.locator('[data-sentry-component="CardJob"]').first()
  await expect(card.locator(":scope > :first-child")).toHaveAttribute("data-todaystart", "warning")
  await card.evaluate(element => { element.addEventListener("click", () => { element.setAttribute("data-card-clicked", "true") }) })
  await warning.locator("summary").click()
  await expect(card).not.toHaveAttribute("data-card-clicked", "true")
  await expect(warning).toContainText(prior.jobTitle)
  await expect(warning).toContainText("2026-10-10")
  await expect(warning.getByRole("link", { name: "기존 지원 공고 바로가기 ↗" })).toHaveAttribute("href", prior.jobUrl!)
  await jobs.screenshot({ path: "test-results/jobkorea-biglink-same-site-warning.png", fullPage: true })
})

for (const platform of ["jobkorea", "saramin"] as const) {
for (const origin of ["same-site", "other-site"] as const) {
test(`끝 슬래시 검색 목록: ${platform} ${origin} 이력과 스크롤 후 새 카드`, async ({ ui, context }) => {
  const source = platform === "jobkorea" ? searchPage5 : publicMetadata.saraminSearch
  const url = platform === "jobkorea"
    ? "https://www.jobkorea.co.kr/Search/?stext=react&tabType=recruit&ord=RegDtDesc"
    : "https://www.saramin.co.kr/zf_user/search/?searchword=react"
  const historyPlatform = origin === "same-site" ? platform : platform === "jobkorea" ? "saramin" : "jobkorea"
  const prior = record({ platform: historyPlatform, companyName: source.expected[0]!.companyName, normalizedCompanyName: source.expected[0]!.companyName, jobTitle: "이전에 지원한 다른 직무", sourceApplicationId: "trailing-search-prior", sourceJobId: "70000001" })
  await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [prior] } })
  await context.route(url, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture(platform === "jobkorea" ? "public/jobkoreaSearchPage5.html" : "public/saraminSearch.html") }))
  const jobs = await context.newPage()
  await jobs.goto(url)
  const cardSelector = platform === "jobkorea" ? '[data-sentry-component="CardJob"]' : ".item_recruit"
  const first = jobs.locator(cardSelector).first()
  const warning = jobs.locator("todaystart-warning")
  await expect(warning).toHaveCount(1)
  await expect(warning.locator("summary")).toHaveText(`오늘시작 · ${historyPlatform === "jobkorea" ? "잡코리아" : "사람인"} 지원 이력 있음`)
  await expect(first.locator(":scope > :first-child")).toHaveAttribute("data-todaystart", "warning")
  await warning.locator("summary").click()
  await expect(warning).toContainText(prior.jobTitle)
  await expect(warning).toContainText("2026-10-10")
  await jobs.evaluate(selector => {
    const original = document.querySelector(selector)!
    const next = original.cloneNode(true) as HTMLElement
    next.querySelectorAll("todaystart-warning").forEach(element => element.remove())
    next.id = "new-card-after-scroll"
    next.style.marginTop = "1400px"
    original.parentElement!.append(next)
    next.scrollIntoView()
  }, cardSelector)
  const appended = jobs.locator("#new-card-after-scroll")
  await expect(appended.locator("todaystart-warning")).toHaveCount(1)
  await expect(appended.locator("todaystart-warning")).toBeVisible()
  await expect(warning).toHaveCount(2)
  const page = await pageMessage<PageState>(ui, jobs.url(), "GET_PAGE")
  expect(page.ok && page.data).toMatchObject({ platform, kind: "listing", profileReady: true, matches: 2 })
  await jobs.reload()
  await expect(warning).toHaveCount(1)
  expect(await count(ui)).toBe(1)
})
}
}

test("잡코리아 수집 → 사람인 상세 경고", async ({ ui, context }) => {
  await setup(ui)
  const history = await open(context, "jobkorea", "history")
  expect((await sync(ui, history))?.collected).toBe(2)
  const jobs = await open(context, "saramin", "detail")
  await expect(jobs.locator("todaystart-warning")).toHaveCount(1)
  await expect(jobs.getByText("잡코리아 · 2026-10-12 · 지원 완료")).toBeVisible()
  await expect(jobs.getByText("지원 직무: 서비스 기획자")).toBeVisible()
})

test("플랫폼 수집을 끄면 중단하고 다시 켜면 열린 내역만 자동 수집", async ({ ui, context }) => {
  await setup(ui, false, true)
  const history = await open(context, "saramin", "history")
  await pageMessage(ui, history.url(), "GET_PAGE")
  expect(await count(ui)).toBe(0)
  await setup(ui, true, true)
  await expect.poll(() => count(ui)).toBe(3)
  await history.evaluate(() => { document.querySelector(".s-application")!.remove() })
  await expect.poll(() => count(ui)).toBe(3)
})

test("빈 목록·로그인·선택자 변경에도 기존 데이터 보존", async ({ ui, context }) => {
  await setup(ui)
  const history = await open(context, "saramin", "history")
  await sync(ui, history)
  await history.evaluate(() => document.querySelector("#s-history")!.innerHTML = '<p id="s-empty">지원 내역이 없습니다</p>')
  const empty = await sync(ui, history)
  expect(empty?.collected).toBe(0)
  expect(await count(ui)).toBe(3)
  await history.evaluate(() => document.querySelector("#s-history")!.remove())
  await sync(ui, history)
  expect(await count(ui)).toBe(3)
  await history.evaluate(() => { const p = document.createElement("p"); p.id = "s-login-required"; document.body.append(p) })
  await sync(ui, history)
  expect(await count(ui)).toBe(3)
})

test("설정 변경 시 현재 공고 경고 제거 및 복구", async ({ ui, context }) => {
  await setup(ui)
  const history = await open(context, "saramin", "history")
  await sync(ui, history)
  const jobs = await open(context, "jobkorea", "jobs")
  await expect(jobs.locator("todaystart-warning")).toHaveCount(1)
  await ui.getByRole("button", { name: "설정", exact: true }).click()
  await ui.getByRole("switch", { name: "공고 목록 경고" }).click()
  await expect(jobs.locator("todaystart-warning")).toHaveCount(0)
  await ui.getByRole("switch", { name: "공고 목록 경고" }).click()
  await expect(jobs.locator("todaystart-warning")).toHaveCount(1)
})

test("검색·필터·수정·CSV·JSON 복원·삭제", async ({ ui, context }) => {
  await setup(ui)
  const history = await open(context, "saramin", "history")
  await sync(ui, history)
  await ui.reload()
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  const search = ui.getByRole("textbox", { name: "기업명 또는 직무 검색" })
  await search.fill("백엔드")
  await expect(ui.locator("tbody tr")).toHaveCount(1)
  await ui.getByRole("button", { name: /백엔드 개발자 수정/ }).click()
  await ui.getByLabel("지원 직무", { exact: true }).fill("백엔드 엔지니어")
  await ui.getByRole("button", { name: "변경 저장" }).click()
  await expect(ui.getByText("기록을 수정했습니다.")).toBeVisible()
  const csvDownload = ui.waitForEvent("download")
  await ui.getByRole("button", { name: "CSV 내보내기" }).click()
  expect((await csvDownload).suggestedFilename()).toMatch(/\.csv$/)
  const backup = await rpc(ui, { type: "backup" })
  await ui.getByRole("button", { name: "설정", exact: true }).click()
  await ui.getByLabel("JSON 백업 파일").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(ui.getByText(/백업 복원 완료/)).toBeVisible()
  expect(await count(ui)).toBe(3)
  await ui.getByRole("button", { name: "지원 기록", exact: false }).first().click()
  await search.fill("백엔드 엔지니어")
  await ui.getByRole("button", { name: /백엔드 엔지니어 삭제/ }).click()
  await ui.getByRole("button", { name: "기록 삭제", exact: true }).click()
  await expect(ui.getByText("기록을 삭제했습니다.")).toBeVisible()
  expect(await count(ui)).toBe(2)
})

test("선택자 JSON은 실제 UI로 등록할 수 있다", async ({ ui }) => {
  await ui.getByRole("button", { name: "설정", exact: true }).click()
  await ui.getByText("사이트 수집 진단", { exact: true }).click()
  await ui.getByLabel("선택자 JSON 파일").setInputFiles(path.resolve("tests/fixtures/profiles/saramin.json"))
  await expect(ui.getByText("사람인 · fixture-only-v1 등록됨")).toBeVisible()
})

test("단순 클릭은 저장하지 않고 제출은 확인 대기, 완료 마커로만 확정", async ({ ui, context }) => {
  await setup(ui, true, true)
  const page = await open(context, "saramin", "detail")
  await pageMessage(ui, page.url(), "GET_PAGE")
  await page.evaluate(() => {
    const root = document.querySelector("#s-jobs")!
    root.innerHTML = '<form id="s-apply-form" data-job-id="999"><strong class="s-company">새로운기회</strong><a class="s-title" href="/zf_user/jobs/relay/view?rec_idx=999">개발자</a><button type="button">지원 버튼</button><button type="submit">최종 제출</button></form>'
    document.querySelector("form")!.addEventListener("submit", e => e.preventDefault())
  })
  await page.getByRole("button", { name: "지원 버튼", exact: true }).click()
  expect(await count(ui)).toBe(0)
  await page.getByRole("button", { name: "최종 제출" }).click()
  await expect.poll(() => count(ui)).toBe(1)
  expect((await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.status).toBe("pending_confirmation")
  await page.evaluate(() => {
    const result = document.querySelector("form")!
    result.id = "s-result"
    result.setAttribute("data-application-id", "s-999")
    const success = document.createElement("p"); success.id = "s-success"; success.textContent = "입사지원이 완료되었습니다"
    document.querySelector("#s-jobs")!.append(success)
  })
  await expect.poll(async () => (await rpc<Snapshot>(ui, { type: "snapshot" })).records[0]?.status).toBe("applied")
  expect(await count(ui)).toBe(1)
  await page.reload()
  expect(await count(ui)).toBe(1)
})

test("오프라인에서도 로컬 검색 및 백업 가능", async ({ ui, context }) => {
  await setup(ui)
  await sync(ui, await open(context, "jobkorea", "history"))
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await context.setOffline(true)
  await ui.reload()
  await expect(ui.locator("td.job-cell").filter({ hasText: "서비스 기획자" })).toBeVisible()
  expect((await rpc<{ records: unknown[] }>(ui, { type: "backup" })).records).toHaveLength(2)
})

test("페이지 이동·기간 범위를 진단하고 다음 페이지 파싱 실패 시 보존", async ({ ui, context }) => {
  await setup(ui)
  const history = await open(context, "saramin", "history")
  await history.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>("#s-next")!
    button.disabled = false
    button.addEventListener("click", () => {
      document.querySelector("#s-period")!.textContent = "2026.09.01 ~ 2026.09.30 · 2페이지"
      document.querySelector("#s-history")!.innerHTML = "<p>페이지 로딩 실패</p>"
    })
  })
  await sync(ui, history)
  let snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.reports.saramin).toMatchObject({ hasNextPage: true, code: "partial" })
  const next = await pageMessage(ui, history.url(), "NEXT_PAGE")
  expect(next.ok).toBe(true)
  await sync(ui, history)
  snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
  expect(snapshot.reports.saramin).toMatchObject({ code: "dom_changed", collected: 0, scope: "2026.09.01 ~ 2026.09.30 · 2페이지" })
  expect(snapshot.records).toHaveLength(3)
})

test("지연 렌더링과 컨테이너 교체 후에도 경고가 한 번만 표시", async ({ ui, context }) => {
  await setup(ui)
  await sync(ui, await open(context, "saramin", "history"))
  await context.route("https://www.jobkorea.co.kr/__todaystart/jobs", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: "<html><body><section id='shell'><h1>지연 로딩 fixture</h1></section></body></html>" }))
  const jobs = await open(context, "jobkorea", "jobs")
  await pageMessage(ui, jobs.url(), "GET_PAGE")
  await jobs.evaluate(() => {
    const root = document.createElement("main"); root.id = "j-recruit"
    root.innerHTML = '<article class="j-card"><strong data-field="company">헌터협회</strong><a data-field="job" href="/Recruit/GI_Read/555">개발자</a></article>'
    document.querySelector("#shell")!.append(root)
  })
  await expect(jobs.locator("todaystart-warning")).toHaveCount(1)
  await jobs.evaluate(() => {
    const root = document.querySelector("#j-recruit")!
    const replacement = root.cloneNode(true) as Element
    replacement.querySelectorAll("todaystart-warning").forEach(node => node.remove())
    root.replaceWith(replacement)
  })
  await expect(jobs.locator("todaystart-warning")).toHaveCount(1)
  await expect(jobs.locator("todaystart-warning summary")).toHaveText(/지원 이력 있음/)
})

test("Service Worker 중지·재기동 이후에도 같은 지원 이력을 조회", async ({ ui, context }) => {
  await setup(ui)
  await sync(ui, await open(context, "saramin", "history"))
  const session = await context.newCDPSession(ui)
  await session.send("ServiceWorker.enable")
  await session.send("ServiceWorker.stopAllWorkers")
  await expect.poll(() => count(ui)).toBe(3)
  await ui.reload()
  await ui.getByRole("button", { name: "지원 기록 관리", exact: true }).click()
  await expect(ui.locator("td.job-cell").filter({ hasText: "백엔드 개발자" })).toBeVisible()
  await session.detach()
})

for (const id of Object.keys(publicMetadata) as (keyof typeof publicMetadata)[]) {
  test(`공개 DOM ${id}: 실제 캡처 구조에서 기본 경고 및 데이터 분리`, async ({ ui, context }) => {
    const source = publicMetadata[id]
    const companyName = source.expected[0]!.companyName
    const platform = source.platform === "saramin" ? "jobkorea" : "saramin"
    const synthetic = record({ platform, sourceApplicationId: `test-${id}`, companyName, normalizedCompanyName: companyName, jobTitle: "공개 DOM 테스트용 가상 지원 기록", evidence: "manual" })
    await rpc(ui, { type: "restore", backup: { format: "todaystart", version: 1, exportedAt: new Date().toISOString(), records: [synthetic] } })
    await context.route(source.sourceUrl, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: fixture(`public/${id}.html`) }))
    const jobs = await context.newPage()
    await jobs.goto(source.sourceUrl)
    await expect(jobs.locator("todaystart-warning")).toHaveCount(1)
    if (id.endsWith("Detail")) await expect(jobs.locator("todaystart-warning details[open]")).toHaveCount(1)
    else await jobs.locator("todaystart-warning summary").click()
    await expect(jobs.getByText("지원 직무: 공개 DOM 테스트용 가상 지원 기록")).toBeVisible()
    if (id === "jobkoreaList") {
      await expect(jobs.locator("tbody > tr[data-todaystart-owned] > td > todaystart-warning")).toHaveCount(1)
      expect(await jobs.locator("tbody > tr[data-todaystart-owned] > td").getAttribute("colspan")).toBe("5")
    }
    const page = await pageMessage<PageState>(ui, jobs.url(), "GET_PAGE")
    expect(page.ok && page.data.matches).toBe(1)
    const snapshot = await rpc<Snapshot>(ui, { type: "snapshot" })
    expect(snapshot.settings.profiles).toEqual({})
    expect(snapshot.settings.consent).toEqual({ saramin: true, jobkorea: true, wanted: true, remember: true })
    expect(snapshot.records).toHaveLength(1)
    await jobs.screenshot({ path: `test-results/public-${id}.png`, fullPage: true })
    // Warning visibility and popup matching status are separate settings.
    await rpc(ui, { type: "settings", settings: { ...snapshot.settings, listingWarnings: false, detailWarnings: false } })
    await expect(jobs.locator("todaystart-warning")).toHaveCount(0)
    await expect(jobs.locator("[data-todaystart-owned]")).toHaveCount(0)
    const hidden = await pageMessage<PageState>(ui, jobs.url(), "GET_PAGE")
    expect(hidden.ok && hidden.data.matches).toBe(1)
  })
}
