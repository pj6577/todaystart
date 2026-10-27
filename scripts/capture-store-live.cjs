const { chromium } = require('@playwright/test')
const path = require('node:path')
const fs = require('node:fs')
;(async () => {
  const verifyTrailing = process.argv.includes('--verify-trailing')
  const out = path.resolve(verifyTrailing ? 'docs/warning-route-verification' : 'docs/store-source')
  fs.mkdirSync(out, {recursive: true})
  const context = await chromium.launchPersistentContext('', {channel: 'chromium', headless: true,
    viewport: {width: 1440, height: 1050}, deviceScaleFactor: 2, args: [`--disable-extensions-except=${path.resolve('build/chrome-mv3-prod')}`, `--load-extension=${path.resolve('build/chrome-mv3-prod')}`]})
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
    const id = new URL(worker.url()).host
    const ui = await context.newPage()
    await ui.goto(`chrome-extension://${id}/options.html`)
    const page = await context.newPage()
    await page.goto(verifyTrailing ? 'https://www.jobkorea.co.kr/Search/?stext=react&tabType=recruit&ord=RegDtDesc' : 'https://www.jobkorea.co.kr/Search?stext=react&tabType=recruit&Page_No=5', {waitUntil:'domcontentloaded', timeout:45000})
    const cards = page.locator('[data-sentry-component="CardJob"]')
    await cards.first().waitFor({timeout:20000})
    const company = (await cards.first().locator('a[href*="/Recruit/GI_Read/"]:not([data-sentry-component]) > span:first-child').textContent()).trim()
    const stamp = new Date().toISOString()
    const record = {id:'store-live-example',platform:verifyTrailing ? 'jobkorea' : 'saramin',companyName:company,normalizedCompanyName:company.replace(/[\s()㈜]/g,''),jobTitle:'프론트엔드 개발자',appliedAt:'2026-10-15',status:'applied',readStatus:'read',evidence:'manual',sourceApplicationId:'store-example-live',collectedAt:stamp,lastSeenAt:stamp,lastSyncedAt:stamp}
    await ui.evaluate(async ({record,stamp}) => {
      const initial = await chrome.runtime.sendMessage({type:'snapshot'})
      await chrome.runtime.sendMessage({type:'settings',settings:{...initial.data.settings,theme:'light'}})
      const restored = await chrome.runtime.sendMessage({type:'restore',backup:{format:'todaystart',version:1,exportedAt:stamp,records:[record]}})
      if (!restored.ok) throw new Error(restored.error)
    }, {record,stamp})
    await page.reload({waitUntil:'domcontentloaded'})
    const warning = cards.first().locator('todaystart-warning')
    await warning.waitFor({timeout:15000})
    if (verifyTrailing) {
      if (!(await warning.locator('summary').textContent()).includes('잡코리아 지원 이력 있음')) throw new Error('Same-site history was not displayed')
      if (!(await cards.first().locator(':scope > :first-child').getAttribute('data-todaystart') === 'warning')) throw new Error('Warning is not at the top of the card')
    }
    await warning.locator('summary').click()
    await cards.first().scrollIntoViewIfNeeded()
    await page.screenshot({path:path.join(out,'jobkorea-live.png'),animations:'disabled'})
    await cards.first().screenshot({path:path.join(out,'jobkorea-live-card.png'),animations:'disabled'})
    fs.writeFileSync(path.join(out,'live-source.json'),JSON.stringify({source:page.url(),capturedAt:stamp,platform:record.platform,extensionVersion:await ui.evaluate(()=>chrome.runtime.getManifest().version),description:'Public Jobkorea search with fictional prior application injected by actual extension. No account login or application submitted.'},null,2))
    console.log('Captured public Jobkorea screen and actual warning with a fictional prior record.')
  } finally {await context.close()}
})().catch(error => {console.error(error.message);process.exitCode=1})
