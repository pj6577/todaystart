// Store artwork uses real extension captures; no generated or redrawn product UI.
const {chromium} = require('@playwright/test')
const sharp = require('sharp')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const source = path.join(root, 'docs/store-source')
const output = path.join(root, 'release/store-v2')
const data = (file, type = 'image/png') => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`
const image = async (file, crop) => {
  const retinaPath = path.join(source, 'retina', file)
  const filePath = fs.existsSync(retinaPath) ? retinaPath : path.join(source, file)
  const metadata = await sharp(filePath).metadata()
  const factor = file.startsWith('jobkorea-live') ? 1 : metadata.width / 1280
  let pipeline = sharp(filePath)
  if (crop) pipeline = pipeline.extract(Object.fromEntries(Object.entries(crop).map(([key,value])=>[key,Math.round(value*factor)])))
  return `data:image/png;base64,${(await pipeline.png().toBuffer()).toString('base64')}`
}
const browserBar = (label, dark = false) => `<div class="browser-bar ${dark ? 'night' : ''}"><span class="dots"><i></i><i></i><i></i></span><span class="address"><svg width="10" height="12" viewBox="0 0 10 12" fill="none"><rect x="1" y="5" width="8" height="6" rx="1.5" stroke="currentColor"/><path d="M3 5V3a2 2 0 0 1 4 0v2" stroke="currentColor"/></svg>${label}</span><span class="window-menu">•••</span></div>`

;(async () => {
  fs.mkdirSync(output, {recursive:true})
  const font = data(path.join(root, 'assets/branding/PretendardVariable.woff2'), 'font/woff2')
  const numberFont = data(path.join(root,'assets/branding/BricolageGrotesque-Bold.ttf'), 'font/ttf')
  const icon = data(path.join(root,'assets/icon.svg'),'image/svg+xml')
  const logos = ['saramin.svg','jobkorea-wordmark.png','wanted.svg'].map(name => data(path.join(root,'assets/platforms',name),name.endsWith('.svg')?'image/svg+xml':'image/png'))
  const overview = await image('01-dashboard-1280x800.png', {left:240,top:65,width:1008,height:730})
  const card = await image('jobkorea-live-card.png')
  const manual = await image('03-manual-record-1280x800.png', {left:390,top:68,width:500,height:664})
  const records = await image('04-records-dark-1280x800.png', {left:256,top:432,width:984,height:342})
  const css = `@font-face{font-family:Pretendard;src:url('${font}');font-weight:100 900}@font-face{font-family:Grotesque;src:url('${numberFont}');font-weight:700}
  *{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:Pretendard,sans-serif;color:#252726;background:#f7f4ef;-webkit-font-smoothing:antialiased}h1,h2,p{margin:0}.slide{position:relative;width:1280px;height:800px;overflow:hidden}
  .brand{position:absolute;left:64px;top:40px;display:flex;align-items:center;gap:10px;font-weight:740;font-size:23px;letter-spacing:-1px}.brand img{width:35px;height:35px;border-radius:9px}.top-note{position:absolute;right:64px;top:52px;font-size:12px;font-weight:600;letter-spacing:1.8px;color:#87867e}.eyebrow{font-size:13px;font-weight:750;letter-spacing:1.6px;color:#a64c35}.title{font-weight:760;letter-spacing:-2.6px;line-height:1.22}.sub{font-size:18px;line-height:1.75;letter-spacing:-.4px;color:#6b6d66}.accent{color:#c75b3c}.footer{position:absolute;bottom:30px;left:64px;right:64px;display:flex;align-items:center;justify-content:space-between;color:#85867e;font-size:11px;letter-spacing:-.1px}.page-number{font-family:Grotesque,sans-serif;font-size:14px;letter-spacing:1px;color:#92958b}.pill{display:inline-flex;align-items:center;gap:7px;border:1px solid #deded4;border-radius:24px;padding:10px 15px;font-size:13px;font-weight:600;color:#62665d;background:#faf9f4}.dot{width:6px;height:6px;border-radius:50%;background:#c75b3c}
  .browser{position:absolute;border:1px solid #d9dcd4;border-radius:12px;overflow:hidden;background:white;box-shadow:0 24px 50px -18px #32382d30,0 3px 10px #32382d08}.browser-bar{height:40px;display:flex;align-items:center;padding:0 16px;gap:18px;background:#f2f3ef;border-bottom:1px solid #dfe1d9;color:#777d70;font-size:10px}.dots{display:flex;gap:5px}.dots i{width:7px;height:7px;border-radius:50%;background:#d3d7cf}.dots i:first-child{background:#d7aaa0}.dots i:nth-child(2){background:#dbcca1}.dots i:nth-child(3){background:#a9bba5}.address{display:flex;gap:7px;align-items:center;justify-content:center;margin:auto;background:#fff;border:1px solid #e1e3dc;border-radius:5px;height:23px;width:58%;font-size:10px}.window-menu{font-weight:800;letter-spacing:2px}.browser-content{padding:12px;background:#fafafa}.browser-content img{display:block;width:100%;height:auto}.night{background:#242a28;border-color:#3b423d;color:#a5ada6}.night .address{background:#181d1b;border-color:#3a433c;color:#b1b9b3}
  .hero{background:radial-gradient(ellipse at 83% 42%,#e8ecdc 0,transparent 42%),#f7f4ef}.hero .copy{position:absolute;left:64px;top:183px;width:400px}.hero h1{font-size:49px;margin:21px 0 23px}.hero .sub{font-size:17px}.hero .browser{left:480px;top:153px;width:736px;transform:rotate(-1.6deg);transform-origin:center}.hero .platforms{position:absolute;left:64px;top:540px;display:flex;gap:10px}.platforms>span{width:109px;height:53px;display:grid;place-items:center;background:#fff;border:1px solid #e2e3da;border-radius:9px}.platforms img{width:82px;max-height:23px;object-fit:contain}.hero .platform-note{position:absolute;left:64px;top:608px;color:#7b7d74;font-size:12px}.hero .hero-label{position:absolute;left:722px;top:715px;color:#6d7468;font-size:12px}.hero-label span{display:inline-block;width:28px;height:1px;background:#b5beb0;vertical-align:middle;margin-right:10px}
  .cross{background:#f5f6f0}.cross .eyebrow{position:absolute;left:64px;top:124px}.cross h1{position:absolute;left:64px;top:153px;font-size:49px}.cross .sub{position:absolute;left:64px;top:224px}.cross .pill{position:absolute;right:64px;top:169px;background:#fff}.cross .browser{left:64px;top:299px;width:1152px}.cross .browser-content{padding:13px 30px;background:#f7f8fb}.cross .browser-content img{width:100%;border-radius:8px}.cross .footer{bottom:24px}
  .manual{background:#f7f1ea}.manual .copy{position:absolute;left:64px;top:151px;width:522px}.manual h1{font-size:49px;margin-top:19px}.manual .sub{margin-top:24px;font-size:17px}.manual .form-shot{position:absolute;left:696px;top:94px;width:478px;border-radius:12px;overflow:hidden;border:1px solid #e3ddd6;box-shadow:0 30px 65px -23px #7354423d,0 4px 12px #705c3912}.form-shot img{width:100%;display:block}.steps{position:absolute;left:64px;top:435px;width:500px}.step{display:flex;align-items:center;gap:17px;margin-bottom:24px;color:#5a5f55;font-size:16px}.step b{font-family:Grotesque,sans-serif;font-size:17px;color:#a8674e;width:32px;height:32px;border-radius:50%;border:1px solid #dac9ba;display:grid;place-items:center}.manual .save-note{position:absolute;left:64px;top:645px;font-size:13px;color:#8b7767;border-left:2px solid #cb8164;padding:9px 14px}
  .privacy{background:radial-gradient(ellipse at 82% 62%,#28382c 0,transparent 60%),#1c2420;color:#f7f6ef}.privacy .top-note{color:#8e9d90}.privacy .brand img{background:#fff8ee}.privacy .eyebrow{position:absolute;left:64px;top:119px;color:#d69e7f}.privacy h1{position:absolute;left:64px;top:150px;font-size:47px;line-height:1.24}.privacy .sub{position:absolute;left:64px;top:226px;color:#a9b7a9;font-size:17px}.privacy .file-tags{position:absolute;right:64px;top:170px;display:flex;gap:10px}.file-tags span{display:flex;align-items:center;gap:10px;border:1px solid #4d5e50;border-radius:8px;padding:14px 17px;color:#d7e0d3;font-size:14px;letter-spacing:1px}.file-tags svg{color:#cba68f}.privacy .browser{left:64px;top:302px;width:1152px;border-color:#4b5549;box-shadow:0 26px 60px -12px #0005}.privacy .browser-content{background:#101411;padding:16px 28px}.privacy .browser-content img{border-radius:6px}.privacy .footer{color:#829481}.privacy .page-number{color:#b3c0b0}
  /* Optical spacing calibrated after inspecting the four finished canvases. */
  .hero .platforms{top:562px}.hero .platform-note{top:631px}.hero .hero-label{left:64px;top:681px}
  .cross .browser{left:80px;top:268px;width:1120px}
  .manual .steps{top:470px}.manual .step{margin-bottom:18px}.manual .step:last-child{margin-bottom:0}.manual .save-note{top:655px}
  .privacy .browser{top:284px}
  `
  const header = (n, category) => `<div class="brand"><img src="${icon}" alt="">오늘시작</div><div class="top-note">${category}</div>`
  const footer = (n, text = '화면의 기업명과 지원 내역은 이해를 돕기 위한 예시입니다.') => `<div class="footer"><span>${text}</span><span class="page-number">0${n} / 04</span></div>`
  const fileIcon = `<svg width="16" height="20" viewBox="0 0 16 20" fill="none"><path d="M9 1H2a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7L9 1Z" stroke="currentColor"/><path d="M9 1v6h6M4 11h8m-8 4h8" stroke="currentColor"/></svg>`
  const slides = [
    {name:'01-all-your-applications-1280x800.png',html:`<section class="slide hero">${header(1,'YOUR NEXT CHAPTER')}<div class="copy"><div class="eyebrow">여러 사이트에 흩어진 지원 이력</div><h1 class="title">지원 기록은<br><span class="accent">한곳에.</span><br>다음 기회는<br>더 가볍게.</h1><p class="sub">어디에, 언제, 어떤 직무로 지원했는지<br>오늘시작에서 함께 확인하세요.</p></div><div class="platforms">${logos.map(logo=>`<span><img src="${logo}" alt=""></span>`).join('')}</div><div class="platform-note">사람인 · 잡코리아 · 원티드 · 직접 지원</div><div class="browser">${browserBar('오늘시작 / 지원 현황')}<div class="browser-content"><img src="${overview}" alt="실제 대시보드 화면"></div></div><div class="hero-label"><span></span>지원 통계부터 이전 이력까지, 한눈에</div>${footer(1)}</section>`},
    {name:'02-before-you-apply-1280x800.png',html:`<section class="slide cross">${header(2,'CHECK BEFORE YOU APPLY')}<div class="eyebrow">공고를 보는 순간, 이전 지원을 함께</div><h1 class="title">“이 회사, 전에 지원했었나?”</h1><p class="sub">다른 사이트에서 지원한 기록도 공고 안에서 확인하세요.</p><div class="pill"><span class="dot"></span>이전 지원 직무와 날짜까지</div><div class="browser">${browserBar('jobkorea.co.kr / 채용공고 검색')}<div class="browser-content"><img src="${card}" alt="실제 잡코리아 공고 안의 오늘시작 안내"></div></div>${footer(2,'실제 잡코리아 공개 공고에 가상의 지원 이력을 표시한 데모입니다.')}</section>`},
    {name:'03-every-application-counts-1280x800.png',html:`<section class="slide manual">${header(3,'KEEP EVERY OPPORTUNITY')}<div class="copy"><div class="eyebrow">기업 홈페이지 · 이메일 · 기타 경로</div><h1 class="title">직접 지원한<br>그 기회도,<br><span class="accent">빠짐없이.</span></h1><p class="sub">채용 사이트 밖의 지원까지 직접 추가하고<br>이전 이력과 함께 관리하세요.</p></div><div class="steps"><div class="step"><b>1</b>지원한 기업과 직무 입력</div><div class="step"><b>2</b>날짜와 지원 경로 기록</div><div class="step"><b>3</b>기존 지원 이력과 함께 확인</div></div><div class="save-note">회사명과 직무로 검색하면 더 쉽게 찾을 수 있어요.</div><div class="form-shot"><img src="${manual}" alt="실제 지원 기록 직접 추가 입력창"></div>${footer(3)}</section>`},
    {name:'04-your-records-your-browser-1280x800.png',html:`<section class="slide privacy">${header(4,'YOUR RECORDS, YOUR SPACE')}<div class="eyebrow">별도 회원가입 없이, 외부 전송 없이</div><h1 class="title">내 지원 기록은, 내 브라우저에.</h1><p class="sub">필요할 때 CSV로 내보내고, JSON 파일로 백업하세요.</p><div class="file-tags"><span>${fileIcon} CSV</span><span>${fileIcon} JSON</span></div><div class="browser">${browserBar('오늘시작 / 지원 기록 · 다크 모드',true)}<div class="browser-content"><img src="${records}" alt="실제 다크 모드 지원 기록 목록"></div></div>${footer(4)}</section>`}
  ]
  const browser = await chromium.launch({channel:'chromium',headless:true})
  try {
    const page = await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:2})
    for (const slide of slides) {
      await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}</style>${slide.html}</html>`)
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()))})
      const overflow = await page.locator('.brand,.top-note,.copy,.footer,.browser,.form-shot,.file-tags,.pill').evaluateAll(elements=>elements.flatMap(element=>{const b=element.getBoundingClientRect();return b.left < 0 || b.top < 0 || b.right > 1280 || b.bottom > 800 ? [element.className] : []}))
      if (overflow.length) throw new Error(`Canvas overflow: ${slide.name}: ${overflow.join(', ')}`)
      const collisions=await page.evaluate(()=>{
        const pairs=[['.hero .copy','.hero .platforms',20],['.cross .sub','.cross .browser',10],['.cross .browser','.cross .footer',12],['.manual .copy','.manual .steps',20],['.manual .steps','.manual .save-note',20],['.privacy .browser','.privacy .footer',12]]
        return pairs.flatMap(([a,b,gap])=>{const first=document.querySelector(a),second=document.querySelector(b);return first && second && first.getBoundingClientRect().bottom+gap>second.getBoundingClientRect().top?[`${a} overlaps ${b}`]:[]})
      })
      if(collisions.length)throw new Error(`${slide.name}: ${collisions.join(', ')}`)
      const buffer=await page.screenshot({animations:'disabled'})
      await sharp(buffer).resize(1280,800).removeAlpha().png().toFile(path.join(output,slide.name))
      console.log(slide.name)
    }
  } finally {await browser.close()}
  for (const name of ['icon-128.png','icon-512.png']) fs.copyFileSync(path.join(root,'release/store',name),path.join(output,name))
  const listing=fs.readFileSync(path.join(root,'release/store/스토어-등록정보.txt'),'utf8')
    .replace('01: 지원 통계와 사이트별 기록 가져오기','01: 지원 기록 통합과 서비스 가치 소개 (실제 앱 화면을 활용한 랜딩 구성)')
    .replace('02: 공고 상세에서 이전 지원 이력 확인 (재구성한 공고 예시 화면)','02: 실제 잡코리아 공개 검색 공고에서 사람인 이전 지원 이력 확인')
    .replace('03: 기업 홈페이지 등 직접 지원한 기록 추가','03: 기업 홈페이지, 이메일 등 직접 지원 기록 추가와 사용 방법 안내')
    .replace('04: 다크 모드에서 지원 기록 관리','04: 브라우저 로컬 저장, CSV 내보내기와 JSON 백업 소개')
    .replace('모든 기업명과 지원 내역은 가상 예시입니다. 실제 계정 정보는 포함하지 않습니다.','01, 03, 04의 기업과 기록은 가상 예시입니다. 02는 공개된 실제 잡코리아 공고에 가상 지원 이력을 표시한 데모입니다. 실제 계정 정보는 포함하지 않습니다.\n파일명의 01~04 순서대로 업로드하세요. 각 이미지는 1280×800 RGB PNG입니다.')
  fs.writeFileSync(path.join(output,'스토어-등록정보.txt'),listing)
  fs.copyFileSync(path.join(root,'docs/store-art-direction.md'),path.join(output,'디자인-방향.md'))
  const preview=await Promise.all(slides.map(async(slide,index)=>({input:await sharp(path.join(output,slide.name)).resize(640,400).toBuffer(),left:index%2*640,top:Math.floor(index/2)*400})))
  await sharp({create:{width:1280,height:800,channels:3,background:'#f7f4ef'}}).composite(preview).png().toFile(path.join(source,'store-v2-preview.png'))
  for(const slide of slides){const m=await sharp(path.join(output,slide.name)).metadata();if(m.width!==1280 || m.height!==800 || m.hasAlpha)throw new Error(`Wrong output format: ${slide.name}`)}
  console.log('Composed 4 landing-style store screenshots at 1280x800 RGB PNG.')
})().catch(error=>{console.error(error);process.exitCode=1})
