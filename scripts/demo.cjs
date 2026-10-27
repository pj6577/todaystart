const { chromium } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')

;(async () => {
  const extension = path.resolve(__dirname, '../build/chrome-mv3-prod')
  const fixtures = path.resolve(__dirname, '../tests/fixtures')
  const smoke = process.argv.includes('--smoke')
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: smoke,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1440, height: 960 }
  })
  await context.route('https://**/*', async route => {
    const url = new URL(route.request().url())
    const platform = url.hostname === 'www.saramin.co.kr' ? 'saramin' : url.hostname === 'www.jobkorea.co.kr' ? 'jobkorea' : undefined
    if (!platform) return route.abort()
    const file = platform + (url.pathname.includes('history') ? '-history.html' : '-jobs.html')
    await route.fulfill({ contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(fixtures, file), 'utf8') })
  })
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
  const id = new URL(worker.url()).host
  const ui = await context.newPage()
  await ui.goto(`chrome-extension://${id}/options.html`)
  const profiles = Object.fromEntries(['saramin', 'jobkorea'].map(p => [p, JSON.parse(fs.readFileSync(path.join(fixtures, 'profiles', p + '.json'), 'utf8'))]))
  await ui.evaluate(async profiles => {
    const snapshot = await chrome.runtime.sendMessage({ type: 'snapshot' })
    if (!snapshot.ok) throw new Error(snapshot.error)
    const result = await chrome.runtime.sendMessage({ type: 'settings', settings: { ...snapshot.data.settings, historyAutoCollect: true, profiles } })
    if (!result.ok) throw new Error(result.error)
  }, profiles)
  const pages = []
  for (const [platform, screen] of [['saramin', 'history'], ['jobkorea', 'history'], ['jobkorea', 'jobs'], ['saramin', 'jobs']]) {
    const page = await context.newPage()
    await page.goto(`https://www.${platform}.co.kr/__todaystart/${screen}`)
    pages.push(page)
  }
  await ui.bringToFront()
  if (smoke) {
    await ui.evaluate(async () => {
      const snapshot = await chrome.runtime.sendMessage({ type: 'snapshot' })
      const result = await chrome.runtime.sendMessage({ type: 'settings', settings: { ...snapshot.data.settings, theme: 'light' } })
      if (!result.ok) throw new Error(result.error)
    })
    const { expect } = require('@playwright/test')
    await expect.poll(async () => {
      const snapshot = await ui.evaluate(() => chrome.runtime.sendMessage({ type: 'snapshot' }))
      return snapshot.data.records.length
    }).toBe(5)
    await expect(pages[2].locator('todaystart-warning')).toHaveCount(1)
    await expect(pages[3].locator('todaystart-warning')).toHaveCount(1)
    await expect(ui.locator('.dashboard-analytics')).toBeVisible()
    fs.mkdirSync(path.resolve(__dirname, '../docs/screenshots'), { recursive: true })
    await expect(pages[2].locator('todaystart-warning')).toHaveAttribute('data-theme', 'light')
    await pages[2].locator('todaystart-warning summary').click()
    await pages[2].screenshot({ path: path.resolve(__dirname, '../docs/screenshots/warning.png'), fullPage: true, animations: 'disabled' })
    await ui.screenshot({ path: path.resolve(__dirname, '../docs/screenshots/overview.png'), fullPage: true, animations: 'disabled' })
    const popup = await context.newPage()
    await popup.setViewportSize({ width: 400, height: 600 })
    await popup.goto(`chrome-extension://${id}/popup.html`)
    await expect(popup.locator('.recent-record')).toHaveCount(3)
    await expect(popup.locator('html')).toHaveAttribute('data-theme', 'light')
    await popup.screenshot({ path: path.resolve(__dirname, '../docs/screenshots/popup-light.png'), animations: 'disabled' })
    await ui.evaluate(async () => {
      const snapshot = await chrome.runtime.sendMessage({ type: 'snapshot' })
      const result = await chrome.runtime.sendMessage({ type: 'settings', settings: { ...snapshot.data.settings, theme: 'dark' } })
      if (!result.ok) throw new Error(result.error)
    })
    await expect(ui.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(popup.locator('html')).toHaveAttribute('data-theme', 'dark')
    await ui.screenshot({ path: path.resolve(__dirname, '../docs/screenshots/overview-dark.png'), fullPage: true, animations: 'disabled' })
    await popup.screenshot({ path: path.resolve(__dirname, '../docs/screenshots/popup-dark.png'), animations: 'disabled' })
    await expect(pages[2].locator('todaystart-warning')).toHaveAttribute('data-theme', 'dark')
    await pages[2].locator('todaystart-warning summary').click()
    await pages[2].screenshot({ path: path.resolve(__dirname, '../docs/screenshots/warning-dark.png'), fullPage: true, animations: 'disabled' })
    await context.close()
    console.log('Mock 데모 검증 완료: 두 플랫폼 자동 수집 5건, 양방향 경고 확인. docs/screenshots에 화면 저장.')
    return
  }
  console.log('오늘시작 Mock 데모: 두 플랫폼 자동 수집은 기본으로 켜져 있습니다. 실제 사이트 요청은 Fixture로 대체됩니다.')
  console.log('데모 브라우저를 닫으면 종료됩니다. 임시 프로필의 데이터는 별도로 보관하지 않습니다.')
  await new Promise(resolve => context.once('close', resolve))
})().catch(error => { console.error(error); process.exitCode = 1 })
