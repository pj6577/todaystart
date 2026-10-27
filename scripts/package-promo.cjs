const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium, expect } = require('@playwright/test')
const sharp = require('sharp')

;(async () => {
  const root = path.resolve(__dirname, '..')
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  const out = path.join(root, 'release', `promo-screenshots-${version}`)
  const info = JSON.parse(fs.readFileSync(path.join(out, 'capture-info.json'), 'utf8'))
  const titles = ['다른 사이트의 이전 지원 이력 확인', '이전 지원 이력 확대 보기', '지원 현황 대시보드', '네 곳의 채용 사이트에서 가져오기', '지원 경로를 한곳에서 확인', '다른 경로의 지원도 직접 추가', '기업 조사와 면접 준비 메모', '면접·과제·마감 일정 관리', '내 브라우저에만 저장', '다크 모드', '확장 프로그램 요약 화면']
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  for (const capture of info.screenshots) {
    const image = sharp(path.join(out, capture.file))
    const metadata = await image.metadata()
    if (metadata.format !== 'png' || !metadata.width || !metadata.height) throw new Error('Invalid image: ' + capture.file)
    await image.stats()
    capture.width = metadata.width; capture.height = metadata.height
  }
  fs.writeFileSync(path.join(out, 'capture-info.json'), JSON.stringify(info, null, 2))
  const cards = info.screenshots.map((item, index) => `<article><a href="${item.file}" target="_blank"><div class="image"><img src="${item.file}" alt="${escape(titles[index])}"></div><h2><span>${String(index + 1).padStart(2, '0')}</span>${titles[index]}</h2></a><p>${escape(item.description)}</p><a class="download" href="${item.file}" download>PNG 원본 저장 · ${item.width} × ${item.height}</a></article>`).join('\n')
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>오늘시작 ${version} 홍보 스크린샷</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#202025;font:14px/1.6 'Malgun Gothic',sans-serif}main{max-width:1440px;margin:auto;padding:36px}header{padding-bottom:24px}h1{font-size:25px;letter-spacing:-1px;margin:0 0 8px}header p{margin:4px 0;color:#52525b}header strong{color:#202025}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}article{background:white;border:1px solid #e0e0e6;border-radius:12px;overflow:hidden;padding-bottom:16px}a{color:inherit;text-decoration:none}.image{height:245px;background:#eeeef1;border-bottom:1px solid #e0e0e6;display:flex;align-items:center;justify-content:center}img{display:block;width:100%;height:100%;object-fit:contain}h2{font-size:15px;margin:15px 17px 6px;letter-spacing:-.4px}h2 span{color:#787880;font-size:12px;margin-right:9px}article p{font-size:12px;color:#61616c;margin:0 17px 10px;min-height:40px}.download{font-size:11px;color:#4054a4;margin:0 17px}footer{font-size:12px;color:#61616c;padding-top:24px}@media(max-width:1000px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:580px){main{padding:20px}.grid{grid-template-columns:1fr}}
  </style><main><header><h1>오늘시작 ${version} · 홍보용 스크린샷 11장</h1><p>채용 사이트가 달라도, 같은 회사에 지원한 이력을 확인해요.</p><p><strong>채팅방 추천 순서: 01 → 03 → 05</strong> · 글자가 작게 보일 때는 01 대신 02 확대 화면을 사용하세요.</p><p>지원 기록·메모·일정은 가상 데이터입니다. 이미지를 누르면 원본이 열립니다.</p></header><div class="grid">${cards}</div><footer>01·02는 비로그인 공개 채용 공고 위에 오늘시작이 가상 지원 이력을 표시한 기능 예시입니다. 실제 지원은 하지 않았습니다.<br>앱 화면은 최신 배포 빌드에서 촬영했습니다. 사용자의 개인 브라우저 데이터는 사용하지 않았습니다.</footer></main></html>`
  const index = path.join(out, 'index.html')
  fs.writeFileSync(index, html, 'utf8')
  const browser = await chromium.launch({ channel: 'chromium', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.goto(pathToFileURL(index).href)
    await expect(page.locator('img')).toHaveCount(11)
    await expect.poll(() => page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true)
    await page.screenshot({ path: path.join(out, 'preview.png'), fullPage: true, animations: 'disabled' })
  } finally { await browser.close() }
  console.log('Verified 11 PNGs and generated index.html + preview.png')
})().catch(error => { console.error(error); process.exitCode = 1 })
