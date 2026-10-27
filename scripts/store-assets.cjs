const { chromium, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const retina = process.argv.includes('--retina')
const out = path.resolve(__dirname, retina ? '../docs/store-source/retina' : '../release/store')
const stamp = '2026-10-20T03:00:00.000Z'
const samples = [
  ['saramin', '모닝랩', '프론트엔드 개발자', '2026-10-20', 'read'],
  ['jobkorea', '온길스튜디오', '웹 서비스 개발자', '2026-10-19', 'unread'],
  ['wanted', '다음페이지', '프로덕트 디자이너', '2026-10-18', 'read'],
  ['manual', '새봄컴퍼니', '서비스 기획자', '2026-10-17', 'unknown'],
  ['wanted', '모닝랩', '소프트웨어 엔지니어', '2026-10-15', 'unread'],
  ['saramin', '한걸음테크', '백엔드 개발자', '2026-10-14', 'read'],
  ['jobkorea', '여백컴퍼니', 'UI 디자이너', '2026-10-12', 'unread'],
  ['manual', '온유스튜디오', '브랜드 디자이너', '2026-10-10', 'unknown']
].map(([platform, companyName, jobTitle, appliedAt, readStatus], i) => ({
  id: `store-example-${i}`, platform, companyName, normalizedCompanyName: companyName,
  jobTitle, appliedAt, readStatus, status: 'applied', evidence: platform === 'manual' ? 'manual' : 'history_page',
  sourceApplicationId: `example-${i}`, ...(platform === 'manual' ? {sourceLabel: '기업 홈페이지'} : {}),
  collectedAt: stamp, lastSeenAt: stamp, lastSyncedAt: stamp
}))

async function rpc(page, request) {
  const result = await page.evaluate(request => chrome.runtime.sendMessage(request), request)
  if (!result.ok) throw new Error(result.error)
  return result.data
}
async function settle(page) {
  await page.evaluate(() => document.fonts.ready)
  await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode().catch(() => {}))))
}

;(async () => {
  fs.mkdirSync(out, {recursive: true})
  const extension = path.resolve(__dirname, '../build/chrome-mv3-prod')
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, viewport: {width: 1280, height: 800}, deviceScaleFactor: retina ? 2 : 1,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  })
  try {
    // Isolated demo profile. No signed-in browser or real application data.
    await context.route('https://**/*', route => route.abort())
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
    const id = new URL(worker.url()).host
    const ui = await context.newPage()
    await ui.goto(`chrome-extension://${id}/options.html`)
    await expect(ui.getByRole('heading', {name: '여러 곳에 남긴 지원 기록을 한곳에서 확인해요', exact: true})).toBeVisible()
    const snapshot = await rpc(ui, {type: 'snapshot'})
    await rpc(ui, {type: 'settings', settings: {...snapshot.settings, theme: 'light'}})
    await rpc(ui, {type: 'restore', backup: {format: 'todaystart', version: 1, exportedAt: stamp, records: samples}})
    await worker.evaluate(stamp => chrome.storage.local.set({historyCompletions: {saramin: stamp, jobkorea: stamp, wanted: stamp}}), stamp)
    await expect(ui.locator('.summary-total .stat-number')).toHaveText('8건')
    await expect(ui.locator('html')).toHaveAttribute('data-theme', 'light')
    await settle(ui)
    await ui.screenshot({path: path.join(out, '01-dashboard-1280x800.png'), animations: 'disabled'})

    const icon = fs.readFileSync(path.resolve(__dirname, '../assets/icon.svg')).toString('base64')
    await context.route('https://www.wanted.co.kr/wd/22942', route => route.fulfill({
      contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="ko"><meta charset="utf-8"><title>오늘시작 이전 지원 안내 예시</title><style>
      *{box-sizing:border-box}body{margin:0;background:#fff8ee;color:#352a25;font-family:'Malgun Gothic',sans-serif}a{color:inherit;text-decoration:none}
      .brand{position:absolute;left:64px;top:48px;display:flex;gap:12px;align-items:center;font-size:24px;font-weight:700}.brand img{width:44px;height:44px}
      .intro{position:absolute;left:64px;top:235px;width:390px}.eyebrow{font-size:15px;color:#a3442c;letter-spacing:1px;font-weight:700}h2{font-size:40px;letter-spacing:-2px;line-height:1.45;margin:20px 0}p{font-size:17px;line-height:1.9;color:#6c5a4f}
      main{position:absolute;left:530px;top:164px;width:686px;min-height:470px;background:white;border:1px solid #e9dfd3;border-radius:18px;padding:34px;box-shadow:0 18px 45px #5744310a}main>small{display:block;color:#6c5a4f;font-size:13px;margin-bottom:25px}h1{font-size:25px;letter-spacing:-1px;line-height:1.5;margin:25px 0 12px}main>a{font-size:16px;font-weight:700}main p{font-size:14px}.chips{display:flex;gap:8px;margin-top:20px}.chips span{background:#f7f7f8;padding:9px 12px;border-radius:6px;color:#57534e;font-size:13px}.example{position:absolute;left:64px;bottom:43px;font-size:12px;color:#776c61}
      </style><div class="brand"><img src="data:image/svg+xml;base64,${icon}" alt="">오늘시작</div><section class="intro"><div class="eyebrow">이전 지원 이력 안내</div><h2>이 회사,<br>전에 지원했었나?</h2><p>공고를 볼 때 이전 지원 직무와 날짜를<br>함께 확인하세요.</p></section><main><small>원티드 공고 상세 화면 예시</small><a data-attribute-id="company__click" data-position-id="22942">모닝랩</a><h1>프론트엔드 개발자</h1><p>함께 더 나은 서비스를 만들어 갈 동료를 찾습니다.</p><div class="chips"><span>서울</span><span>경력 1~3년</span><span>개발</span></div></main><div class="example">가상 기업과 예시 기록을 사용해 기능을 보여주는 화면입니다.</div></html>`
    }))
    const jobs = await context.newPage()
    await jobs.goto('https://www.wanted.co.kr/wd/22942')
    const warning = jobs.locator('todaystart-warning')
    await expect(warning).toHaveCount(1)
    await expect(warning).toContainText('사람인')
    await expect(warning).toContainText('원티드')
    if (await warning.locator('details').getAttribute('open') === null) await warning.locator('summary').click()
    await expect(warning.getByText('지원 직무: 프론트엔드 개발자', {exact: true})).toBeVisible()
    await settle(jobs)
    await jobs.screenshot({path: path.join(out, '02-previous-applications-1280x800.png'), animations: 'disabled'})

    await ui.getByRole('button', {name: '지원 기록 관리', exact: true}).click()
    await ui.getByRole('button', {name: '+ 직접 추가', exact: true}).click()
    const form = ui.getByRole('dialog', {name: '지원 기록 직접 추가'})
    await expect(form).toBeVisible()
    await form.getByLabel('기업명', {exact: true}).fill('새봄컴퍼니')
    await form.getByLabel('지원 직무', {exact: true}).fill('서비스 기획자')
    await form.getByLabel('지원 날짜', {exact: true}).fill('2026-10-20')
    await form.getByLabel('공고 주소', {exact: false}).fill('https://careers.example.com/jobs/planner')
    await form.getByRole('heading').click()
    await settle(ui)
    await ui.screenshot({path: path.join(out, '03-manual-record-1280x800.png'), animations: 'disabled'})
    await form.getByRole('button', {name: '취소', exact: true}).click()
    await ui.getByRole('button', {name: '지원 기록 8', exact: true}).click()
    await rpc(ui, {type: 'settings', settings: {...snapshot.settings, theme: 'dark'}})
    await expect(ui.locator('html')).toHaveAttribute('data-theme', 'dark')
    await settle(ui)
    await ui.screenshot({path: path.join(out, '04-records-dark-1280x800.png'), animations: 'disabled'})

    const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'))
    if (manifest.description.includes('&')) throw new Error('HTML entity in description')
    for (const name of fs.readdirSync(out).filter(name => name.endsWith('.png'))) {
      const metadata = await sharp(path.join(out, name)).metadata()
      const size = name.startsWith('icon-') ? Number(name.match(/\d+/)[0]) : 0
      if (metadata.width !== (size || 1280 * (retina ? 2 : 1)) || metadata.height !== (size || 800 * (retina ? 2 : 1))) throw new Error(`Wrong size: ${name}`)
      // Chrome Web Store accepts RGB PNG; ensure screenshots have no alpha.
      const rgb = await sharp(path.join(out, name)).removeAlpha().png().toBuffer()
      fs.writeFileSync(path.join(out, name), rgb)
      console.log(`${name}: ${metadata.width}x${metadata.height}`)
    }
    console.log('Store assets captured from the actual extension with fictional demo records.')
  } finally {await context.close()}
})().catch(error => {console.error(error); process.exitCode = 1})
