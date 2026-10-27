const { chromium } = require('@playwright/test')
const sharp = require('sharp')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const out = path.join(root, 'release/mockup-v2-0.6.20')
const source = path.join(root, 'docs/mockup-v2-source')
const uri = (file, mime = 'image/png') => `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
const shot = name => uri(path.join(source, name))
const icon = uri(path.join(root, 'assets/icon.png'))
const font = uri(path.join(root, 'assets/branding/PretendardVariable.woff2'), 'font/woff2')
const mono = uri(path.join(root, 'assets/branding/GeistMono-Regular.ttf'), 'font/ttf')
const header = index => `<header class="brand"><img src="${icon}" alt="">오늘시작</header><span class="index">0${index} / 05</span>`
const footer = (text = '기업명과 지원 내역은 예시입니다.') => `<footer>${text}</footer>`
const browser = (content, label, cls = '') => `<div class="browser ${cls}" data-check><div class="browser-bar"><span class="traffic"><i></i><i></i><i></i></span><span>${label}</span><span class="browser-mark">오늘시작</span></div><div class="browser-body"><img src="${content}" alt="실제 제품 화면"></div></div>`
const css = `
@font-face{font-family:Pretendard;src:url('${font}');font-weight:100 900}
@font-face{font-family:GeistMono;src:url('${mono}');font-weight:400}
*{box-sizing:border-box}body{margin:0;color:#202226;font-family:Pretendard,sans-serif;-webkit-font-smoothing:antialiased}h1,p{margin:0}.slide{position:relative;width:1280px;height:800px;overflow:hidden;background:#fff}.brand{position:absolute;left:56px;top:36px;display:flex;align-items:center;gap:9px;font-size:20px;font-weight:650;letter-spacing:-.65px;line-height:30px}.brand img{width:30px;height:30px;display:block;border-radius:8px}.index{position:absolute;top:44px;right:56px;font:12px GeistMono,monospace;letter-spacing:.4px;color:#91969d}
.title{position:absolute;left:72px;top:99px;font-size:48px;font-weight:650;line-height:1.18;letter-spacing:-1.65px;word-break:keep-all}.description{position:absolute;left:72px;top:229px;color:#717780;font-size:18px;font-weight:450;line-height:1.65;letter-spacing:-.25px}.stage{position:absolute;left:56px;top:272px;width:1168px;height:486px;background:#f4f5f7;border-radius:24px}.browser{position:absolute;left:112px;top:290px;width:1056px;border:1px solid #dfe2e6;border-radius:13px;background:#fafbfc;overflow:hidden;box-shadow:0 20px 45px -18px #26334324,0 3px 8px #26334306}.browser-bar{height:32px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #e8eaed;padding:0 13px;color:#858b94;font-size:10px;font-weight:450;background:#fbfcfd}.traffic{display:flex;gap:5px}.traffic i{display:block;width:6px;height:6px;border-radius:50%;background:#d5d8dd}.browser-mark{margin-left:auto;font-weight:550;color:#a1a6ad}.browser-body{padding:12px;background:#fafafa}.browser-body img{display:block;width:100%;height:auto}footer{position:absolute;bottom:20px;left:56px;right:56px;font-size:10px;line-height:14px;color:#989da5;text-align:right;letter-spacing:-.1px}
.overview .title{left:180px;right:180px;top:90px;text-align:center}.overview .description{left:150px;right:150px;top:218px;text-align:center}.overview .stage{top:266px;height:492px}.overview .browser{left:140px;top:284px;width:1000px}
.history .browser-body{padding:10px;background:#f6f7fc}.history .description{top:229px}
.calendar .title,.manual .title{left:72px;top:218px;font-size:50px;line-height:1.22}.calendar .description,.manual .description{left:72px;top:365px;font-size:18px;line-height:1.8}.calendar .stage,.manual .stage{left:622px;top:108px;width:594px;height:634px}.calendar .product{position:absolute;left:656px;top:166px;width:526px;box-shadow:0 18px 40px -24px #1b263b45;border-radius:9px;overflow:hidden}.product img{display:block;width:100%;height:auto}.microcopy{position:absolute;left:74px;top:507px;font-size:13px;color:#969ba3;line-height:1.65;letter-spacing:-.1px}
.manual .back-form{position:absolute;left:836px;top:124px;width:324px;border-radius:12px;overflow:hidden;box-shadow:0 8px 28px #1b263b0b}.manual .back-form img{display:block;width:100%;height:auto}.manual .picker{position:absolute;left:646px;top:338px;width:532px;padding:18px;background:#fff;border:1px solid #dfe2e6;border-radius:14px;box-shadow:0 20px 48px -22px #26334347,0 2px 6px #26334305}.manual .picker img{display:block;width:100%;height:auto}.manual .microcopy{top:495px}
.privacy{background:#111315;color:#f6f7f8}.privacy .index{color:#737a84}.privacy .description{color:#9ca3ad}.privacy .stage{background:#1b1e22;top:287px;height:471px}.privacy .browser{top:309px;border-color:#3a3e45;background:#18181b;box-shadow:0 22px 50px #0003}.privacy .browser-bar{background:#23262b;border-color:#363a40;color:#a5abb4}.privacy .browser-mark{color:#737b87}.privacy .traffic i{background:#4c535e}.privacy .browser-body{background:#18181b;padding:12px}.privacy footer{color:#656c76}
`
const slides = [
  { name: '01-overview.png', html: `<section class="slide overview">${header(1)}<h1 class="title" data-check>흩어진 지원 기록,<br>한곳에서 선명하게.</h1><p class="description" data-check>사람인·잡코리아·원티드의 이력과 직접 남긴 기록까지.</p><div class="stage" data-check></div>${browser(shot('dashboard.png'), '오늘시작 · 대시보드')}${footer()}</section>` },
  { name: '02-previous-application.png', html: `<section class="slide history">${header(2)}<h1 class="title" data-check>공고를 보는 순간,<br>이전 지원도 함께.</h1><p class="description" data-check>다른 사이트에서 지원한 직무와 날짜도 바로 확인해요.</p><div class="stage" data-check></div>${browser(shot('previous-application.png'), '잡코리아 · 채용 공고')}${footer('잡코리아 공개 공고에 예시 지원 이력을 표시한 실제 캡처입니다.')}</section>` },
  { name: '03-calendar.png', html: `<section class="slide calendar">${header(3)}<div class="stage" data-check></div><h1 class="title" data-check>하루하루 쌓이는<br>나의 지원 기록.</h1><p class="description" data-check>날짜를 누르면<br>지원한 기업과 직무가 펼쳐져요.</p><p class="microcopy" data-check>날짜별 기록 · 월 이동 · 경로별 보기</p><div class="product" data-check><img src="${shot('calendar.png')}" alt="선택한 날짜의 지원 기록이 펼쳐진 실제 캘린더"></div>${footer()}</section>` },
  { name: '04-manual-paths.png', html: `<section class="slide manual">${header(4)}<div class="stage" data-check></div><h1 class="title" data-check>직접 지원한 기록도,<br>같은 자리에.</h1><p class="description" data-check>리멤버, 점핏, 기업 홈페이지까지.<br>지원한 경로를 골라 직접 남겨요.</p><p class="microcopy" data-check>18개 채용 사이트 + 기업 홈페이지·기타</p><div class="back-form" data-check><img src="${shot('manual.png')}" alt="실제 직접 추가 폼"></div><div class="picker" data-check><img src="${shot('source-picker.png')}" alt="실제 지원 경로 선택 항목 확대"></div>${footer()}</section>` },
  { name: '05-records-and-backup.png', html: `<section class="slide privacy">${header(5)}<h1 class="title" data-check>내 지원 기록은,<br>내 브라우저 안에.</h1><p class="description" data-check>기업과 직무로 찾고, 필요할 때 CSV·JSON으로 보관하세요.</p><div class="stage" data-check></div>${browser(shot('records-dark.png'), '오늘시작 · 지원 기록 · 다크 모드')}${footer()}</section>` }
]
;(async () => {
  fs.mkdirSync(path.join(out, 'retina'), { recursive: true })
  const browserApp = await chromium.launch({ channel: 'chromium', headless: true })
  const measurements = []
  try {
    const page = await browserApp.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
    await page.route('https://**/*', route => route.abort())
    for (const slide of slides) {
      await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}</style>${slide.html}</html>`)
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())) })
      const layout = await page.evaluate(() => {
        const issues = []
        const boxes = [...document.querySelectorAll('[data-check],.brand,.index,footer')].map(el => {
          const b = el.getBoundingClientRect()
          if (b.x < 0 || b.y < 0 || b.right > 1280 || b.bottom > 760 && !el.matches('footer')) issues.push(`${el.className} outside safe canvas: ${b.bottom}`)
          if (el.matches('.title,.description,.microcopy') && el.scrollWidth > el.clientWidth + 1) issues.push(`${el.className} text overflow`)
          return { class: el.className, x: b.x, y: b.y, width: b.width, height: b.height }
        })
        const title = document.querySelector('.title').getBoundingClientRect(), description = document.querySelector('.description').getBoundingClientRect()
        if (title.bottom + 12 > description.top) issues.push('Title and description collide')
        return { issues, boxes }
      })
      if (layout.issues.length) throw new Error(`${slide.name}: ${layout.issues.join('; ')}`)
      measurements.push({ file: slide.name, ...layout })
      const buffer = await page.screenshot({ animations: 'disabled' })
      await sharp(buffer).removeAlpha().png().toFile(path.join(out, 'retina', slide.name))
      await sharp(buffer).resize(1280, 800, { kernel: 'lanczos3' }).removeAlpha().png().toFile(path.join(out, slide.name))
      console.log(slide.name)
    }
    await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}.slide{background:#f7f8fa}.meta{position:absolute;left:72px;top:178px}.meta h1{font-size:58px;font-weight:650;letter-spacing:-2px;line-height:1.2}.meta p{margin-top:32px;font-size:24px;color:#737b86;line-height:1.8}.meta-note{position:absolute;left:72px;bottom:72px;font:16px GeistMono,monospace;color:#989ea7}</style><section class="slide"><div class="brand"><img src="${icon}" alt="">오늘시작</div><div class="meta"><h1>목업 v2</h1><p>지원 기록을 돌아보는 다섯 장의 화면.<br>1280 × 800 PNG · 고해상도 원본 포함</p></div><div class="meta-note">PRODUCT 0.6.20 / 2026.10</div></section></html>`)
    await page.evaluate(() => document.fonts.ready)
    await sharp(await page.screenshot()).resize(640, 400).removeAlpha().png().toFile(path.join(source, 'preview-index.png'))
  } finally { await browserApp.close() }
  await sharp(path.join(root, 'assets/icon.png')).resize(128, 128).png().toFile(path.join(out, 'icon-128.png'))
  await sharp(path.join(root, 'assets/icon.png')).resize(512, 512).png().toFile(path.join(out, 'icon-512.png'))
  fs.copyFileSync(path.join(root, 'docs/mockup-v2-art-direction.md'), path.join(out, 'design-direction.md'))
  fs.copyFileSync(path.join(source, 'provenance.json'), path.join(out, 'provenance.json'))
  fs.mkdirSync(path.join(out, 'licenses'), { recursive: true })
  for (const name of ['Pretendard-OFL.txt', 'GeistMono-OFL.txt']) fs.copyFileSync(path.join(root, 'assets/branding', name), path.join(out, 'licenses', name))
  const listing = `오늘시작 목업 v2 · 앱 0.6.20 기준\n\n업로드용: 루트의 01~05 PNG, 각 1280×800 RGB\n고해상도 원본: retina 폴더의 01~05 PNG, 각 2560×1600 RGB\n아이콘: icon-128.png (등록용), icon-512.png (보관용)\n\n01 흩어진 지원 기록 모아 보기\n02 공고에서 이전 지원 직무·날짜 확인\n03 지원 캘린더와 날짜별 기록\n04 직접 추가와 채용 사이트 선택\n05 검색·다크 모드·CSV/JSON 보관\n\n채용 사이트에서 자동으로 가져오기는 사람인·잡코리아·원티드를 지원합니다.\n그 외 사이트는 직접 추가에서 경로를 선택해 기록합니다.\nUI는 실제 앱 캡처이며 모든 지원 내역은 예시입니다.\n02는 보관된 잡코리아 공개 공고 캡처에 가상의 지원 이력을 표시한 화면입니다.\n원본 출처와 캡처 범위는 provenance.json에 기록했습니다.\n`
  fs.writeFileSync(path.join(out, 'README.md'), listing)
  fs.writeFileSync(path.join(source, 'layout-checks.json'), JSON.stringify(measurements, null, 2))
  const previews = await Promise.all(slides.map(async (slide, index) => ({ input: await sharp(path.join(out, slide.name)).resize(640, 400).toBuffer(), left: index % 2 * 664 + 24, top: Math.floor(index / 2) * 424 + 24 })))
  previews.push({ input: fs.readFileSync(path.join(source, 'preview-index.png')), left: 688, top: 872 })
  await sharp({ create: { width: 1352, height: 1296, channels: 3, background: '#e9ebee' } }).composite(previews).png().toFile(path.join(out, 'preview.png'))
  for (const slide of slides) {
    for (const [folder, width, height] of [['', 1280, 800], ['retina', 2560, 1600]]) {
      const m = await sharp(path.join(out, folder, slide.name)).metadata()
      if (m.width !== width || m.height !== height || m.hasAlpha || m.space !== 'srgb') throw new Error(`Invalid output format: ${slide.name}`)
    }
  }
  console.log('Verified five upload PNGs and five retina originals; safe margins and text checked.')
})().catch(error => { console.error(error); process.exitCode = 1 })
