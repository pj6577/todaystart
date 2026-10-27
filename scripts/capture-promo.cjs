const { chromium, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const root = path.resolve(__dirname, '..')
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const out = path.join(root, 'release', `promo-screenshots-${version}`)
const now = '2026-10-22T01:00:00.000Z'
const companies = ['모닝랩', '온길스튜디오', '새봄컴퍼니', '한걸음테크', '여백컴퍼니', '빛길랩', '다음페이지', '온유스튜디오']
const sources = ['saramin', 'jobkorea', 'wanted', 'remember', 'manual']
const days = [21, 21, 20, 20, 19, 19, 19, 16, 16, 15, 15, 14, 14, 13, 12, 12, 9, 8, 7, 6, 5, 2, 1, 1]
const records = days.map((day, i) => ({
  id: `promo-${i}`, platform: sources[i % sources.length], sourceApplicationId: `promo-${i}`,
  companyName: companies[i % companies.length], normalizedCompanyName: companies[i % companies.length],
  jobTitle: ['프론트엔드 개발자', '웹 서비스 개발자', '프로덕트 엔지니어', '서비스 기획자'][i % 4],
  appliedAt: `2026-10-${String(day).padStart(2, '0')}`, status: 'applied',
  evidence: i % 5 === 4 ? 'manual' : 'history_page', ...(i % 5 === 4 ? { sourceLabel: '기업 채용 페이지' } : {}),
  readStatus: i % 4 === 0 ? 'unread' : i % 4 === 3 ? 'unknown' : 'read',
  collectedAt: now, lastSeenAt: now, lastSyncedAt: now
}))
const links = records.map(record => ({ id: randomUUID(), recordId: record.id, aliases: [] }))
const checklist = texts => texts.map((text, index) => ({ id: randomUUID(), text, done: index === 0 }))
const noteData = [
  ['모닝랩 · 1차 면접 준비', '면접에서 물어볼 것\n• 팀의 협업 방식과 역할\n• 피드백을 반영하는 과정\n• 입사 후 처음 맡을 업무\n프로젝트 성과는 숫자와 사례로!', 'yellow', 0, ['프로젝트 발표 연습', '자기소개 1분으로 정리']],
  ['온길스튜디오 · 기업 조사', '서비스를 직접 써 보고 기록해요.\n좋았던 점: 짧고 명확한 가입 과정\n더 알아볼 점: 제품의 고객과 목표\n지원 동기에 내 경험 연결하기.', 'cream', 1, ['서비스 둘러보기', '채용 공고 다시 읽기']],
  ['새봄컴퍼니 · 면접 복기', '잘 전달한 이야기\n공통 컴포넌트를 정리했던 경험.\n다음에 보완할 점\n의사결정의 근거를 구체적으로!\n다음 면접에서 활용할 사례 정리.', 'sage', 2, ['질문과 답변 정리', '보완할 경험 추가']],
  ['이번 주 취업 준비', '이번 주에는 지원 개수보다\n직무와 경험이 잘 맞는 공고에 집중하기.\n\n지원 전에 이전 이력 확인!\n자기소개서는 제출 전 한 번 더 읽기.', 'lavender', undefined, ['포트폴리오 링크 확인', '관심 기업 공고 확인']],
  ['한걸음테크 · 과제 메모', '구현 전에 먼저 정리할 것\n\n1. 사용자가 해결하려는 문제\n2. 화면별 필수 기능\n3. 예외 상황과 안내 문구\n\n마감 하루 전까지 검토 끝내기.', 'rose', 3, ['요구사항 정리', '접근성 확인']],
  ['다음 면접에서 물어볼 질문', '• 팀에서 최근 해결한 기술적 문제는?\n• 새로운 팀원에게 기대하는 역할은?\n• 제품의 우선순위는 어떻게 정하나요?\n\n함께 일하는 모습을 상상해 보기.', 'cream', undefined, []]
]
const notes = noteData.map(([title, body, color, linked, tasks], index) => ({ id: randomUUID(), title, body, color, pinned: index === 0, checklist: checklist(tasks), ...(linked === undefined ? {} : { linkId: links[linked].id }), revision: 1, createdAt: now, updatedAt: now }))
const eventData = [
  ['모닝랩 1차 면접', 'interview', 22, '14:00', 0, '온라인 면접', '프로젝트 경험과 협업 과정을 구체적인 사례로 준비하기.'],
  ['한걸음테크 과제 제출', 'assignment', 23, '18:00', 3, '', '실행 방법과 주요 의사결정을 README에 정리하기.'],
  ['온길스튜디오 코딩테스트', 'assessment', 24, '10:00', 1, '온라인', '응시 환경과 접속 안내 확인.'],
  ['새봄컴퍼니 지원 마감', 'deadline', 26, '23:59', 2, '', '제출 전에 이력서와 포트폴리오 링크 확인하기.'],
  ['여백컴퍼니 결과 확인', 'result', 28, '11:00', 4, '', '메일과 채용 사이트 지원 현황 확인.'],
  ['빛길랩 직무 면접', 'interview', 29, '15:00', 5, '기업 안내 장소', '서비스 개선 경험과 지원 동기 준비.']
]
const events = eventData.map(([title, kind, day, time, linked, location, body]) => ({ id: randomUUID(), title, kind, date: `2026-10-${day}`, time, status: 'planned', location, body, checklist: checklist(['안내 메일 확인', '준비 자료 점검']), linkId: links[linked].id, revision: 1, createdAt: now, updatedAt: now }))
async function rpc(page, request) {
  console.log('Request ' + request.type)
  const result = await page.evaluate(request => Promise.race([chrome.runtime.sendMessage(request), new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out: ' + request.type)), 20000))]), request)
  if (!result?.ok) throw new Error(result?.error || 'Extension unavailable')
  return result.data
}
async function ready(page) {
  await page.evaluate(async () => { await Promise.race([Promise.allSettled([document.fonts.ready, ...[...document.images].map(image => image.decode())]), new Promise(resolve => setTimeout(resolve, 4000))]) })
}
async function badge(page, text = '오늘시작 0.9.2 · 가상 지원 기록으로 촬영한 기능 예시') {
  await page.evaluate(text => {
    document.getElementById('promo-capture-note')?.remove()
    const note = document.createElement('div')
    note.id = 'promo-capture-note'; note.textContent = text
    Object.assign(note.style, { position: 'fixed', bottom: '10px', right: '14px', zIndex: '2147483647', padding: '6px 10px', border: '1px solid #d4d4d8', borderRadius: '6px', background: '#ffffffed', color: '#52525b', font: '11px system-ui', pointerEvents: 'none' })
    document.body.append(note)
  }, text)
}
const captures = []
async function shot(page, name, description, options = {}) {
  await ready(page)
  await page.mouse.move(0, 0)
  await page.screenshot({ path: path.join(out, name), animations: 'disabled', ...options })
  captures.push({ file: name, description })
  console.log('Captured ' + name)
}

;(async () => {
  fs.mkdirSync(out, { recursive: true })
  const extension = path.join(root, 'build/chrome-mv3-prod')
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5, timezoneId: 'Asia/Seoul', args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] })
  console.log('Temporary browser started')
  const watchdog = setTimeout(() => { console.error('Capture deadline exceeded'); void context.close() }, 180000)
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
    const id = new URL(worker.url()).host
    const ui = await context.newPage()
    await ui.clock.setFixedTime(new Date(now))
    await ui.goto(`chrome-extension://${id}/options.html`)
    await expect(ui.locator('.dashboard-overview-top')).toBeVisible()
    const initial = await rpc(ui, { type: 'snapshot' })
    const settings = { ...initial.settings, theme: 'light', historyAutoCollect: false }
    await rpc(ui, { type: 'settings', settings })
    await rpc(ui, { type: 'restore', backup: { format: 'todaystart', version: 2, exportedAt: now, records, links, notes, events,
      board: { order: notes.map(note => note.id), sizes: Object.fromEntries(notes.map(note => [note.id, { width: 344, height: 330 }])), revision: 1, updatedAt: now } } })
    await expect(ui.locator('.nav-count')).toHaveText('24')
    console.log('Seeded fictional records, notes and events')

    // An anonymous public listing, with a fictional cross-site prior record.
    const jobs = await context.newPage()
    const searchUrl = 'https://www.jobkorea.co.kr/Search?stext=react&tabType=recruit&Page_No=5'
    await jobs.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
    console.log('Public listing loaded')
    const cards = jobs.locator('[data-sentry-component="CardJob"]')
    await expect(cards.first()).toBeVisible({ timeout: 25000 })
    const company = (await cards.first().locator('a[href*="/Recruit/GI_Read/"]:not([data-sentry-component]) > span:first-child').textContent()).trim()
    const prior = { ...records[0], id: 'promo-cross-site', sourceApplicationId: 'promo-cross-site', companyName: company, normalizedCompanyName: company.replace(/[\s()㈜]/g, '').replace(/^주/, ''), jobTitle: '프론트엔드 개발자', appliedAt: '2026-10-16' }
    await rpc(ui, { type: 'restore', backup: { format: 'todaystart', version: 1, exportedAt: now, records: [prior] } })
    await jobs.reload({ waitUntil: 'domcontentloaded' })
    const warning = cards.first().locator('todaystart-warning')
    await expect(warning).toContainText('사람인 지원 이력 있음', { timeout: 20000 })
    await warning.locator('summary').click()
    await cards.first().scrollIntoViewIfNeeded()
    await badge(jobs, '기능 예시 · 사람인 지원 이력은 가상 데이터이며 실제 지원 내역이 아닙니다')
    await shot(jobs, '01-cross-site-warning.png', '잡코리아 공고에서 사람인 지원 이력을 확인하는 핵심 기능. 공개 공고 + 가상 지원 이력.')
    await cards.first().evaluate(card => {
      const caption = document.createElement('div')
      caption.textContent = '오늘시작 기능 예시 · 가상 지원 이력입니다'
      Object.assign(caption.style, { padding: '9px 20px', background: '#f5f5f7', color: '#62626b', font: '11px system-ui', textAlign: 'right', borderRadius: '0 0 16px 16px' })
      card.append(caption)
    })
    const box = await cards.first().boundingBox()
    const clip = { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: Math.min(1440 - Math.max(0, box.x - 12), box.width + 24), height: box.height + 24 }
    await shot(jobs, '02-warning-closeup.png', '이전 지원 사이트·날짜·직무가 보이는 확대 화면. 가상 지원 이력.', { clip })

    await ui.bringToFront()
    await badge(ui)
    await ui.getByRole('button', { name: '대시보드', exact: true }).click()
    await expect(ui.locator('.nav-count')).toHaveText('25')
    await shot(ui, '03-dashboard.png', '여러 채용 사이트의 지원 현황과 다가오는 일정. 가상 데이터.')
    await ui.getByRole('button', { name: '지원 기록 관리', exact: true }).click()
    await expect(ui.locator('tbody tr')).toHaveCount(25)
    await shot(ui, '04-import-sites.png', '사람인·잡코리아·원티드·리멤버 지원 기록 가져오기.')
    await ui.locator('.table-tabs').evaluate(element => element.scrollIntoView({ block: 'start' }))
    await shot(ui, '05-application-records.png', '사이트별 지원 경로·날짜·상태를 한곳에서 확인. 가상 데이터.')
    await ui.getByRole('button', { name: '+ 직접 추가', exact: true }).click()
    const form = ui.getByRole('dialog', { name: '지원 기록 직접 추가', exact: true })
    await form.getByLabel('기업명', { exact: true }).fill('새길스튜디오')
    await form.getByLabel('지원 직무', { exact: true }).fill('프론트엔드 개발자')
    await form.getByLabel('지원 날짜', { exact: true }).fill('2026-10-22')
    await shot(ui, '06-manual-entry.png', '기업 채용 페이지 등 다른 경로의 지원 기록도 직접 추가. 입력 예시이며 저장하지 않음.')
    await form.getByRole('button', { name: '취소', exact: true }).click()
    await ui.getByRole('button', { name: '메모', exact: true }).click()
    await expect(ui.locator('.note-frame')).toHaveCount(6)
    await shot(ui, '07-notes.png', '기업 조사·면접 준비·복기를 지원 기록에 연결해 관리. 가상 데이터.')
    await ui.getByRole('button', { name: '취업 캘린더', exact: true }).click()
    await expect(ui.locator('.career-calendar')).toBeVisible()
    await shot(ui, '08-calendar.png', '면접·과제·지원 마감·코딩테스트 일정 관리. 가상 일정.')
    await ui.getByRole('button', { name: '설정', exact: true }).click()
    await expect(ui.locator('.local-data-info')).toBeVisible()
    await shot(ui, '09-local-storage.png', '지원 기록·메모·일정을 브라우저에만 저장하는 안내와 설정.')
    await ui.getByRole('button', { name: '대시보드', exact: true }).click()
    await rpc(ui, { type: 'settings', settings: { ...settings, theme: 'dark' } })
    await expect(ui.locator('html')).toHaveAttribute('data-theme', 'dark')
    await shot(ui, '10-dashboard-dark.png', '다크 모드 대시보드. 가상 데이터.')
    await rpc(ui, { type: 'settings', settings })

    const popup = await context.newPage()
    await popup.clock.setFixedTime(new Date(now))
    await popup.setViewportSize({ width: 400, height: 600 })
    await popup.goto(`chrome-extension://${id}/popup.html`)
    await expect(popup.locator('.recent-record')).toHaveCount(3)
    await shot(popup, '11-extension-popup.png', '확장 프로그램 팝업 상단의 지원 현황 요약. 가상 데이터.', { clip: { x: 0, y: 0, width: 400, height: 344 } })

    const readme = `오늘시작 ${version} 홍보용 스크린샷\n\n추천 전송 순서: 01 → 03 → 05\n중복 지원 확인 기능을 먼저 보여 주고, 여러 사이트의 기록을 모아 보는 흐름으로 설명합니다.\n02는 채팅방에서 글자가 작게 보일 때 01 대신 쓸 수 있는 확대 화면입니다.\n07·08·09는 메모·일정·로컬 저장을 더 설명하고 싶을 때 추가하세요.\n\n모든 지원 이력·메모·일정은 가상 데이터입니다.\n01·02의 채용 공고는 비로그인 공개 화면이며, 사람인 지원 이력은 기능 시연을 위한 가상 데이터입니다. 실제로 해당 회사에 지원하지 않았습니다.\n공고 화면은 회사 이름을 기준으로 이전 지원 이력을 보여 주는 기능 예시이며, 동일 공고·직무임을 자동 확정하거나 지원을 차단하는 기능을 뜻하지 않습니다.\n사용자 개인 브라우저의 데이터는 열거나 변경하지 않았습니다.\n\n${captures.map(item => `${item.file}\n${item.description}`).join('\n\n')}\n`
    fs.writeFileSync(path.join(out, '안내.txt'), readme, 'utf8')
    fs.writeFileSync(path.join(out, 'capture-info.json'), JSON.stringify({ extensionVersion: version, capturedAt: new Date().toISOString(), demoDate: now, dataset: 'fictional', publicPostingSource: jobs.url(), publicCompany: company, screenshots: captures }, null, 2))
    console.log('Saved screenshots to ' + out)
  } finally { clearTimeout(watchdog); await context.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
