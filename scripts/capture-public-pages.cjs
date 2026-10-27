// Explicit, developer-run capture of public pages. No login, history,
// pagination, cookies, or background traversal. Only company/title fragments survive.
const { JSDOM } = require('jsdom')
const fs = require('node:fs')
const path = require('node:path')

const pages = [
  { id: 'wantedDetail', platform: 'wanted', url: 'https://www.wanted.co.kr/wd/22942', root: 'main', posting: ':scope', company: 'a[data-attribute-id="company__click"][data-position-id]', title: 'h1', count: 1 },
  { id: 'saraminSearch', platform: 'saramin', url: 'https://www.saramin.co.kr/zf_user/search?searchword=%EA%B0%9C%EB%B0%9C%EC%9E%90', root: '#recruit_info_list', posting: '.item_recruit', company: '.area_corp .corp_name a', title: '.area_job .job_tit a', link: '.area_job .job_tit a', count: 2 },
  { id: 'saraminDetail', platform: 'saramin', url: 'https://www.saramin.co.kr/zf_user/jobs/relay/pop-view?rec_idx=55272129', root: '.wrap_jv_header', posting: '.jv_header', company: '.title_inner .company', title: 'h1.tit_job', count: 1 },
  { id: 'jobkoreaList', platform: 'jobkorea', url: 'https://www.jobkorea.co.kr/recruit/joblist?localorder=1&menucode=local', root: '#dev-gi-list', posting: '.tplJobList tbody tr.devloopArea', company: '.tplCo a.link', title: '.tplTit .titBx strong a.link', link: '.tplTit .titBx strong a.link', count: 2 },
  { id: 'jobkoreaDetail', platform: 'jobkorea', url: 'https://www.jobkorea.co.kr/Recruit/GI_Read/50195247', root: "main [data-sentry-component='Title']", captureRoot: 'main', posting: ':scope > div > div:first-child', company: "[data-sentry-component='CompanyName'] h2", title: "[data-sentry-component='TitleContent'] h1", count: 1 }
]

function cleanUrl(raw, base) {
  const url = new URL(raw, base)
  const clean = new URL(url.origin + url.pathname)
  const id = url.searchParams.get('rec_idx')
  if (id && /^\d+$/.test(id)) clean.searchParams.set('rec_idx', id)
  return clean.href
}

async function capture(config) {
  const response = await fetch(config.url, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`${config.id}: HTTP ${response.status}`)
  const doc = new JSDOM(await response.text(), { url: response.url }).window.document
  const root = doc.querySelector(config.root)
  if (!root) throw new Error(`${config.id}: root not found`)
  const rows = config.posting === ':scope' ? [root] : [...root.querySelectorAll(config.posting)]
  if (rows.length < config.count) throw new Error(`${config.id}: fewer postings than expected`)
  const selected = rows.slice(0, config.count)
  const expected = selected.map(row => {
    const company = row.querySelector(config.company)
    const title = row.querySelector(config.title)
    if (!company?.textContent.trim() || !title?.textContent.trim()) throw new Error(`${config.id}: missing company/title`)
    return { companyName: company.textContent.trim(), jobTitle: title.textContent.trim(), jobUrl: cleanUrl(config.link ? row.querySelector(config.link).getAttribute('href') : response.url, response.url) }
  })
  // Clone the actual ancestor structure; retain only the chosen company/title/link fields.
  const snapshot = (config.captureRoot ? doc.querySelector(config.captureRoot) : root).cloneNode(true)
  const fieldTargets = selected.flatMap((row, index) => {
    const snapshotRoot = config.captureRoot ? snapshot.querySelector(config.root.replace(/^main\s+/, '')) : snapshot
    const cloneRow = config.posting === ':scope' ? snapshotRoot : snapshotRoot.querySelectorAll(config.posting)[index]
    return [cloneRow.querySelector(config.company), cloneRow.querySelector(config.title)]
  })
  for (const element of [...snapshot.querySelectorAll('*')].reverse()) {
    if (!fieldTargets.some(target => element === target || element.contains(target) || target.contains(element) || (element.matches('td,th') && element.parentElement?.contains(target)))) element.remove()
  }
  for (const element of [snapshot, ...snapshot.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (!['class', 'id', 'href', 'data-sentry-component', 'data-gno', 'data-attribute-id', 'data-position-id'].includes(attribute.name)) element.removeAttribute(attribute.name)
    }
    if (element.hasAttribute('href')) {
      const raw = element.getAttribute('href')
      if (/relay\/(?:pop-)?view|\/Recruit\/GI_Read\//i.test(raw)) element.setAttribute('href', cleanUrl(raw, response.url))
      else element.removeAttribute('href')
    }
  }
  const walker = doc.createTreeWalker(snapshot, 128)
  const comments = []; for (let node = walker.nextNode(); node; node = walker.nextNode()) comments.push(node)
  comments.forEach(node => node.remove())
  const output = path.resolve(__dirname, '../tests/fixtures/public')
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(output, `${config.id}.html`), '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Sanitized public DOM capture — not application history</title></head><body>' + snapshot.outerHTML + '</body></html>')
  return { id: config.id, platform: config.platform, sourceUrl: response.url, capturedAt: new Date().toISOString(), sourcePostingCount: rows.length, capturedPostingCount: selected.length, expected }
}

Promise.all(pages.map(capture)).then(results => {
  const metadata = Object.fromEntries(results.map(result => [result.id, result]))
  fs.writeFileSync(path.resolve(__dirname, '../tests/fixtures/public/metadata.json'), JSON.stringify(metadata, null, 2) + '\n')
  console.log(JSON.stringify(results.map(({ id, sourcePostingCount, capturedPostingCount }) => ({ id, sourcePostingCount, capturedPostingCount })), null, 2))
}).catch(error => { console.error(error.message); process.exitCode = 1 })
