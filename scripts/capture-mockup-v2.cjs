const { chromium, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const out = path.join(root, 'docs/mockup-v2-source')
const stamp = '2026-10-20T03:00:00.000Z'
const names = ['모닝랩', '온길스튜디오', '다음페이지', '새봄컴퍼니', '한걸음테크', '여백컴퍼니', '온유스튜디오', '빛길랩']
const roles = ['프론트엔드 개발자', '웹 서비스 개발자', '소프트웨어 엔지니어', '프로덕트 디자이너']
const dates = ['20', '19', '19', '19', '16', '15', '14', '14', '12', '09', '08', '07', '06', '05', '02', '01', '20', '16', '15', '14', '12', '09', '08', '06']
const sources = ['saramin', 'jobkorea', 'wanted', 'saramin', 'jobkorea', 'wanted', 'manual', 'manual']
const records = dates.map((day, index) => ({
  id: `mockup-v2-${index}`, platform: sources[index % sources.length], sourceApplicationId: `mockup-v2-${index}`,
  companyName: names[(index + Math.floor(index / 8)) % names.length], normalizedCompanyName: names[(index + Math.floor(index / 8)) % names.length], jobTitle: roles[(index + Math.floor(index / 8)) % roles.length],
  appliedAt: `2026-10-${day}`, status: 'applied', evidence: sources[index % sources.length] === 'manual' ? 'manual' : 'history_page',
  ...(sources[index % sources.length] === 'manual' ? { sourceLabel: index % 2 ? '기업 홈페이지' : '리멤버' } : {}),
  readStatus: index % 4 === 0 ? 'unread' : index % 4 === 3 ? 'unknown' : 'read', collectedAt: stamp, lastSeenAt: stamp, lastSyncedAt: stamp
}))
async function rpc(page, request) {
  const result = await page.evaluate(payload => chrome.runtime.sendMessage(payload), request)
  if (!result.ok) throw new Error(result.error)
  return result.data
}
async function ready(page) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())) })
}
;(async () => {
  fs.mkdirSync(out, { recursive: true })
  const extension = path.join(root, 'build/chrome-mv3-prod')
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1120 }, deviceScaleFactor: 2, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] })
  try {
    await context.route('https://**/*', route => route.abort())
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
    const id = new URL(worker.url()).host
    const page = await context.newPage()
    await page.clock.install({ time: new Date(stamp) })
    await page.goto(`chrome-extension://${id}/options.html`)
    await expect(page.locator('.dashboard-overview-top')).toBeVisible()
    const snapshot = await rpc(page, { type: 'snapshot' })
    await rpc(page, { type: 'settings', settings: { ...snapshot.settings, theme: 'light' } })
    await rpc(page, { type: 'restore', backup: { format: 'todaystart', version: 1, exportedAt: stamp, records } })
    await expect(page.locator('.summary-total .stat-number')).toHaveText('24건')
    await ready(page)
    const a = await page.locator('.dashboard-overview-top').boundingBox(), b = await page.locator('.source-panel').boundingBox()
    await page.screenshot({ path: path.join(out, 'dashboard.png'), clip: { x: a.x, y: a.y, width: a.width, height: b.y + b.height - a.y }, animations: 'disabled' })
    await page.getByRole('button', { name: '2026-10-19 지원 3건', exact: true }).click()
    await page.locator('.calendar-panel').screenshot({ path: path.join(out, 'calendar.png'), animations: 'disabled' })
    const c = await page.locator('.calendar-panel').boundingBox(), d = await page.locator('.dashboard-side-column').boundingBox()
    await page.screenshot({ path: path.join(out, 'calendar-and-charts.png'), clip: { x: c.x, y: c.y, width: d.x + d.width - c.x, height: c.height }, animations: 'disabled' })
    await page.getByRole('button', { name: '지원 기록 관리', exact: true }).click()
    await page.getByRole('button', { name: '+ 직접 추가', exact: true }).click()
    const form = page.getByRole('dialog', { name: '지원 기록 직접 추가', exact: true })
    await form.getByLabel('기업명', { exact: true }).fill('새봄컴퍼니')
    await form.getByLabel('지원 직무', { exact: true }).fill('프론트엔드 개발자')
    await form.getByLabel('지원 날짜', { exact: true }).fill('2026-10-20')
    await form.getByRole('radio', { name: '리멤버', exact: true }).check()
    await form.getByRole('heading').click()
    await ready(page)
    await form.screenshot({ path: path.join(out, 'manual.png'), animations: 'disabled' })
    await form.locator('.manual-source-fieldset').screenshot({ path: path.join(out, 'source-picker.png'), animations: 'disabled' })
    await form.getByRole('button', { name: '취소', exact: true }).click()
    await rpc(page, { type: 'settings', settings: { ...snapshot.settings, theme: 'dark' } })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await ready(page)
    const card = await page.locator('section.card').boundingBox()
    await page.screenshot({ path: path.join(out, 'records-dark.png'), clip: { x: card.x, y: card.y, width: card.width, height: 410 }, animations: 'disabled' })
    fs.copyFileSync(path.join(root, 'docs/store-source/jobkorea-live-card.png'), path.join(out, 'previous-application.png'))
    fs.writeFileSync(path.join(out, 'provenance.json'), JSON.stringify({ extensionVersion: '0.6.20', capturedAt: new Date().toISOString(), demoClock: stamp, records: records.length, profile: 'Fresh temporary Chromium profile, all external requests blocked.', warningSource: 'docs/store-source/jobkorea-live-card.png', warningCapturedAt: '2026-10-20T03:13:06.571Z', warningDescription: 'Previously captured public Jobkorea posting with fictional prior application. No login or actual application.' }, null, 2))
    console.log('Captured current product UI with 24 fictional records; no live account used.')
  } finally { await context.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
