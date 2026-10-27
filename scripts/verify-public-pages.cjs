// Opt-in verification against public pages, using an isolated disposable profile.
// Seeded application records are explicitly synthetic and never touch the user's Chrome data.
const { chromium, expect } = require('@playwright/test')
const path = require('node:path')
const fs = require('node:fs')
const metadata = require('../tests/fixtures/public/metadata.json')

async function main() {
  const extension = path.resolve(__dirname, '../build/chrome-mv3-prod')
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  })
  const results = []
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
    const id = new URL(worker.url()).host
    const ui = await context.newPage()
    await ui.goto(`chrome-extension://${id}/options.html`)
    for (const [name, source] of Object.entries(metadata)) {
      const page = await context.newPage()
      try {
        // Third-party assets may hold DOMContentLoaded; wait for the actual company
        // field below instead of requiring every blocking asset to finish.
        await page.goto(source.sourceUrl, { waitUntil: 'commit', timeout: 30000 })
        const selectors = {
          wantedDetail: 'main a[data-attribute-id="company__click"][data-position-id]',
          saraminSearch: '#recruit_info_list .item_recruit .area_corp .corp_name a',
          saraminDetail: '.wrap_jv_header .jv_header .title_inner .company',
          jobkoreaList: '#dev-gi-list .tplJobList tbody tr.devloopArea .tplCo a.link',
          jobkoreaDetail: "main [data-sentry-component='Title'] [data-sentry-component='CompanyName'] h2"
        }
        const company = page.locator(selectors[name]).first()
        await company.waitFor({ state: 'visible', timeout: 15000 })
        const companyName = (await company.textContent()).trim()
        const opposite = source.platform === 'saramin' ? 'jobkorea' : 'saramin'
        const now = new Date().toISOString()
        const record = {
          id: JSON.stringify([opposite, 'application', `synthetic-${name}`]),
          platform: opposite, sourceApplicationId: `synthetic-${name}`,
          companyName, normalizedCompanyName: companyName,
          jobTitle: '공개 DOM 검증용 가상 지원 — 실제 지원 이력 아님',
          appliedAt: '2026-10-10', status: 'applied', evidence: 'manual',
          collectedAt: now, lastSeenAt: now, lastSyncedAt: now
        }
        const result = await ui.evaluate(async backup => chrome.runtime.sendMessage({ type: 'restore', backup }), { format: 'todaystart', version: 1, exportedAt: now, records: [record] })
        if (!result.ok) throw new Error(result.error)
        const warning = page.locator('todaystart-warning').filter({ hasText: record.jobTitle }).first()
        await warning.waitFor({ state: 'visible', timeout: 15000 })
        await expect(warning.locator('summary')).toContainText('지원 이력 있음')
        const state = await ui.evaluate(async url => {
          const tabs = await chrome.tabs.query({ url })
          return chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE' })
        }, page.url())
        if (!state.ok || !state.data.matches) throw new Error('Popup page state did not report a match')
        results.push({ name, sourceUrl: page.url(), success: true, kind: state.data.kind, matchingPostings: state.data.matches })
        console.log(`${name}: PASS (${state.data.matches} matching postings, synthetic history only)`)
      } catch (error) {
        results.push({ name, sourceUrl: source.sourceUrl, success: false, error: error.message })
        console.log(`${name}: FAIL (${error.message.split('\n')[0]})`)
      } finally { await page.close() }
    }
  } finally { await context.close() }
  const output = path.resolve(__dirname, '../docs/public-live-verification.json')
  fs.writeFileSync(output, JSON.stringify({ checkedAt: new Date().toISOString(), syntheticHistoryOnly: true, results }, null, 2) + '\n')
  if (results.length !== Object.keys(metadata).length || results.some(result => !result.success)) process.exitCode = 1
}

main().catch(error => { console.error(error); process.exitCode = 1 })
