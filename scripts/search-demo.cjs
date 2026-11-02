const { chromium, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')

// A temporary profile only. No access to the user's browser/account or application records.
;(async () => {
  const smoke = process.argv.includes('--smoke')
  const extension = path.resolve(__dirname, '../build/chrome-mv3-prod')
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: smoke,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1440, height: 1000 }
  })
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
    const ui = await context.newPage()
    await ui.goto(`chrome-extension://${new URL(worker.url()).host}/options.html#search`)
    if (!smoke) {
      console.log('오늘시작 공고 통합검색 데모 · 실제 사이트 직접 요청 · 임시 브라우저 프로필')
      await new Promise(resolve => context.once('close', resolve))
      return
    }
    const requests = []
    ui.on('request', request => { if (request.url().startsWith('https://')) requests.push({ url: request.url(), method: request.method() }) })
    await ui.getByRole('searchbox', { name: '채용공고 검색어' }).fill('frontend')
    await ui.getByRole('button', { name: '통합검색', exact: true }).click()
    await expect(ui.locator('[data-search-platform]:not([data-search-platform="all"])')).toHaveCount(3)
    await expect(ui.locator('.job-search-demo')).toHaveAttribute('aria-busy', 'false', { timeout: 30000 })
    const results = await ui.locator('[data-search-platform]:not([data-search-platform="all"])').evaluateAll(buttons => buttons.map(button => ({ platform: button.dataset.searchPlatform, status: button.dataset.searchStatus, count: Number(button.dataset.resultCount) })))
    const successfulSites = results.filter(site => site.status === 'ok').length
    const report = { query: 'frontend', successfulSites, complete: successfulSites === 3, results, cards: await ui.locator('.job-search-card').count(), requests }
    console.log(JSON.stringify(report, null, 2))
    expect(requests).toHaveLength(3)
    expect(context.pages()).toHaveLength(2) // Chromium blank tab + extension UI; no source tabs.
    const out = path.resolve(__dirname, '../.tmp/search-demo')
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, 'live-result.json'), JSON.stringify(report, null, 2))
    for (const theme of ['dark', 'light']) {
      await ui.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
      await ui.screenshot({ path: path.join(out, `${theme}.png`), fullPage: false })
    }
    // Live availability is reported independently; a partial result is not a three-site success.
    expect(successfulSites).toBeGreaterThan(0)
  } finally { await context.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
