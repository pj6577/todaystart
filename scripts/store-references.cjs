const {chromium} = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
;(async()=>{
  const out=path.resolve('docs/store-references')
  fs.mkdirSync(out,{recursive:true})
  const browser=await chromium.launch({channel:'chromium',headless:true})
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1050}})
    for(const [name,url] of [['toss-pos','https://tossplace.com/product/pos'],['notion-clipper','https://www.notion.com/web-clipper']]){
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000})
      await page.waitForLoadState('networkidle',{timeout:7000}).catch(()=>{})
      await page.evaluate(()=>document.fonts.ready)
      await page.screenshot({path:path.join(out,`${name}-top.png`),animations:'disabled'})
      await page.evaluate(()=>scrollTo(0,900))
      await page.waitForLoadState('networkidle',{timeout:3000}).catch(()=>{})
      await page.screenshot({path:path.join(out,`${name}-product.png`),animations:'disabled'})
      console.log(name,url)
    }
  }finally{await browser.close()}
})().catch(error=>{console.error(error.message);process.exitCode=1})
