const {chromium} = require('@playwright/test')
const sharp = require('sharp')
const fs = require('node:fs')
const path = require('node:path')
const root=path.resolve(__dirname,'..')
const output=path.join(root,'release/store-v3')
const source=path.join(root,'docs/store-source')
const data=(file,type='image/png')=>`data:${type};base64,${fs.readFileSync(file).toString('base64')}`
async function captureImage(name,crop){
  const retina=path.join(source,'retina',name)
  const file=fs.existsSync(retina)?retina:path.join(source,name)
  let pipeline=sharp(file)
  if(crop){
    const metadata=await pipeline.metadata()
    const factor=metadata.width/1280
    pipeline=pipeline.extract(Object.fromEntries(Object.entries(crop).map(([k,v])=>[k,Math.round(v*factor)])))
  }
  return `data:image/png;base64,${(await pipeline.png().toBuffer()).toString('base64')}`
}

;(async()=>{
  fs.mkdirSync(output,{recursive:true})
  const font=data(path.join(root,'assets/branding/SUIT-Variable.woff2'),'font/woff2')
  const icon=data(path.join(root,'assets/icon.svg'),'image/svg+xml')
  const overview=await captureImage('01-dashboard-1280x800.png')
  const card=await captureImage('jobkorea-live-card.png')
  const manual=await captureImage('03-manual-record-1280x800.png',{left:390,top:68,width:500,height:664})
  const records=await captureImage('04-records-dark-1280x800.png',{left:256,top:432,width:984,height:342})
  const css=`
  @font-face{font-family:SUIT;src:url('${font}');font-weight:100 900;font-style:normal}
  *{box-sizing:border-box}body{margin:0;font-family:SUIT,sans-serif;color:#333d4b;background:#fff;-webkit-font-smoothing:antialiased}h1,p{margin:0}.slide{position:relative;width:1280px;height:800px;overflow:hidden;background:#fff}
  .brand{position:absolute;top:34px;left:64px;display:flex;align-items:center;gap:9px;font-size:20px;line-height:28px;font-weight:650;letter-spacing:-.3px}.brand img{width:28px;height:28px;display:block;border-radius:7px}
  .headline{position:absolute;top:103px;left:128px;width:1024px;text-align:center;font-size:40px;font-weight:650;line-height:1.36;letter-spacing:-.6px;color:#191f28;word-break:keep-all}
  .description{position:absolute;left:128px;top:226px;width:1024px;text-align:center;font-size:20px;font-weight:450;line-height:1.6;letter-spacing:-.2px;color:#6b7684;word-break:keep-all}
  .example{position:absolute;right:64px;bottom:22px;color:#8b95a1;font-size:11px;line-height:16px}
  .stage{position:absolute;background:#f2f4f6;border-radius:16px;left:64px;top:292px;width:1152px;height:456px}
  .window{position:absolute;border:1px solid #d9dfe5;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 6px 18px #191f280b}
  .chrome{height:32px;background:#f8f9fa;border-bottom:1px solid #e5e8eb;display:flex;align-items:center;padding:0 13px;gap:10px;color:#8b95a1;font-size:11px;font-weight:450}.chrome .tab{display:flex;align-items:center;gap:6px;min-width:155px;color:#4e5968}.chrome .address{border-left:1px solid #e5e8eb;padding-left:14px;flex:1}.chrome svg{width:12px;height:12px;flex:none}.chrome .controls{font-size:14px;letter-spacing:5px;color:#b0b8c1}.window .screen{display:block;width:100%;height:auto}
  .overview .headline{top:100px;font-size:40px;line-height:56px}.overview .description{top:174px;font-size:19px}
  .laptop{position:absolute;left:255px;top:216px;width:770px}.laptop-display{padding:7px;background:#25282b;border-radius:13px 13px 3px 3px;box-shadow:0 2px 3px #191f2812;border:1px solid #101214}.laptop-inner{overflow:hidden;border-radius:7px 7px 0 0;background:#fff}.laptop-inner .chrome{height:28px;font-size:10px}.laptop-inner .chrome .tab{min-width:124px}.laptop-inner img{display:block;width:100%;height:auto}.laptop-base{position:relative;margin-left:-55px;width:880px;height:13px;background:linear-gradient(#e1e4e7 0%,#b8bec4 100%);border-radius:2px 2px 30px 30px;box-shadow:0 3px 3px #191f280d}.laptop-base:before{content:'';position:absolute;left:357px;top:0;width:166px;height:5px;background:#b8bec4;border-radius:0 0 6px 6px}.laptop-ground{position:absolute;bottom:-8px;left:10px;right:10px;height:9px;border-radius:50%;background:#191f2808;filter:blur(6px)}
  .history .window{left:128px;top:300px;width:1024px}.history .window-body{padding:10px 18px;background:#f8f9fc}.history .window-body img{display:block;width:100%;height:auto;border-radius:7px}
  .manual .stage{left:650px;top:83px;width:566px;height:649px}.manual .headline{left:80px;top:251px;width:490px;text-align:left;font-size:40px;line-height:1.4}.manual .description{left:80px;top:389px;width:490px;text-align:left;font-size:20px;line-height:1.65}.manual .fields{position:absolute;left:80px;top:506px;color:#8b95a1;font-size:16px;line-height:1.6;letter-spacing:-.2px}.manual .form{position:absolute;left:717px;top:104px;width:432px;border:1px solid #d9dfe5;border-radius:11px;overflow:hidden;box-shadow:0 6px 18px #191f2809}.manual .form img{display:block;width:100%;height:auto}
  .search .window{left:96px;top:314px;width:1088px;background:#18181b;border-color:#d9dfe5}.search .window-body{padding:14px 17px 16px;background:#18181b}.search .window-body img{display:block;width:100%;height:auto;border-radius:7px}
  `
  const brand=`<div class="brand"><img src="${icon}" alt="">오늘시작</div>`
  const example=text=>`<div class="example">${text||'예시 화면'}</div>`
  const chrome=(tab,address)=>`<div class="chrome"><span class="tab"><svg viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor"/><path d="M1 4h10" stroke="currentColor"/></svg>${tab}</span><span class="address">${address}</span><span class="controls">− ×</span></div>`
  const slides=[
    {name:'01-지원기록-한곳에.png',html:`<section class="slide overview">${brand}<h1 class="headline">흩어진 지원 기록을 한곳에 모아요</h1><p class="description">사람인, 잡코리아, 원티드의 이력과 직접 지원한 기록까지 확인해요.</p><div class="laptop"><div class="laptop-display"><div class="laptop-inner">${chrome('오늘시작','지원 현황')}<img src="${overview}" alt="지원 현황 대시보드"></div></div><div class="laptop-base"></div><div class="laptop-ground"></div></div>${example()}</section>`},
    {name:'02-이전지원-바로확인.png',html:`<section class="slide history">${brand}<h1 class="headline">지원했던 회사인지<br>공고에서 바로 확인해요</h1><p class="description">다른 사이트에서 지원한 직무와 날짜도 함께 볼 수 있어요.</p><div class="stage"></div><div class="window">${chrome('잡코리아','jobkorea.co.kr / 채용공고 검색')}<div class="window-body"><img src="${card}" alt="공개 잡코리아 공고의 실제 오늘시작 안내"></div></div>${example('공개 공고에 예시 지원 내역을 표시한 화면입니다.')}</section>`},
    {name:'03-직접지원-기록추가.png',html:`<section class="slide manual">${brand}<div class="stage"></div><h1 class="headline">직접 지원한 기록도<br>간단하게 추가해요</h1><p class="description">기업 홈페이지나 이메일로 지원한 내역도<br>함께 관리할 수 있어요.</p><p class="fields">기업명 · 지원 직무 · 지원일 · 지원 경로</p><div class="form"><img src="${manual}" alt="지원 기록 직접 추가 화면"></div>${example()}</section>`},
    {name:'04-기업과직무로-검색.png',html:`<section class="slide search">${brand}<h1 class="headline">회사명과 직무로<br>필요한 기록을 찾아요</h1><p class="description">지원 경로와 날짜, 열람 여부도 한눈에 확인할 수 있어요.</p><div class="stage"></div><div class="window">${chrome('오늘시작','지원 기록 · 다크 모드')}<div class="window-body"><img src="${records}" alt="회사명과 직무로 검색하는 지원 기록 화면"></div></div>${example()}</section>`}
  ]
  const browser=await chromium.launch({channel:'chromium',headless:true})
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:2})
    for(const slide of slides){
      await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}</style>${slide.html}</html>`)
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()))})
      const geometry=await page.evaluate(()=>{
        const issues=[]
        for(const el of document.querySelectorAll('.headline,.description,.example,.laptop,.laptop-base,.window,.stage,.form,.fields')){
          const b=el.getBoundingClientRect()
          if(b.left<0 || b.top<0 || b.right>1280 || b.bottom>800)issues.push(`Outside canvas: ${el.className}`)
          if(el.matches('.headline,.description,.example,.fields') && el.scrollWidth>el.clientWidth+1)issues.push(`Text overflow: ${el.className}`)
        }
        const heading=document.querySelector('.headline').getBoundingClientRect()
        const description=document.querySelector('.description').getBoundingClientRect()
        if(heading.bottom+14>description.top)issues.push('Headline and description too close')
        const evidence=document.querySelector('.window,.laptop,.form').getBoundingClientRect()
        if(!document.querySelector('.manual') && description.bottom+10>evidence.top)issues.push('Description and product too close')
        const footer=document.querySelector('.example').getBoundingClientRect()
        if(evidence.bottom+10>footer.top)issues.push('Product and caption too close')
        return issues
      })
      if(geometry.length)throw new Error(`${slide.name}: ${geometry.join('; ')}`)
      await sharp(await page.screenshot({animations:'disabled'})).resize(1280,800).removeAlpha().png().toFile(path.join(output,slide.name))
      console.log(slide.name)
    }
  }finally{await browser.close()}
  for(const name of ['icon-128.png','icon-512.png'])fs.copyFileSync(path.join(root,'release/store',name),path.join(output,name))
  const listing=fs.readFileSync(path.join(root,'release/store/스토어-등록정보.txt'),'utf8')
    .replace('01: 지원 통계와 사이트별 기록 가져오기','01: 여러 사이트의 지원 기록을 한곳에 모아 보기')
    .replace('02: 공고 상세에서 이전 지원 이력 확인 (재구성한 공고 예시 화면)','02: 공개 잡코리아 공고에서 다른 사이트의 이전 지원 확인')
    .replace('04: 다크 모드에서 지원 기록 관리','04: 회사명, 직무 검색과 지원 경로, 날짜, 열람 여부 확인')
    .replace('모든 기업명과 지원 내역은 가상 예시입니다. 실제 계정 정보는 포함하지 않습니다.','01, 03, 04의 기업과 기록은 가상 예시입니다. 02는 실제 잡코리아 공개 공고에 가상 지원 이력을 표시한 화면입니다. 실제 계정 정보는 포함하지 않습니다.\n01~04 순서대로 업로드하세요. 모든 이미지는 1280×800 RGB PNG입니다.')
  fs.writeFileSync(path.join(output,'스토어-등록정보.txt'),listing)
  fs.copyFileSync(path.join(root,'docs/store-art-direction-v3.md'),path.join(output,'제작-설명.md'))
  const previews=await Promise.all(slides.map(async(slide,i)=>({input:await sharp(path.join(output,slide.name)).resize(640,400).toBuffer(),left:i%2*640,top:Math.floor(i/2)*400})))
  await sharp({create:{width:1280,height:800,channels:3,background:'#fff'}}).composite(previews).png().toFile(path.join(source,'store-v3-preview.png'))
  for(const slide of slides){const m=await sharp(path.join(output,slide.name)).metadata();if(m.width!==1280||m.height!==800||m.hasAlpha)throw new Error(`Invalid PNG: ${slide.name}`)}
  console.log('Verified four 1280x800 RGB PNGs.')
})().catch(error=>{console.error(error);process.exitCode=1})
