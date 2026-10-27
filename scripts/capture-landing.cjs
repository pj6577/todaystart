const { chromium, expect } = require("@playwright/test")
const fs = require("node:fs")
const path = require("node:path")
const { randomUUID } = require("node:crypto")

const root = path.resolve(__dirname, "..")
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version
const out = path.join(root, "landing/assets/screens")
const now = "2026-10-27T01:00:00.000Z"
const companies = [
  "모닝랩",
  "온길스튜디오",
  "새봄컴퍼니",
  "한걸음테크",
  "여백컴퍼니",
  "빛길랩",
  "다음페이지",
  "온유스튜디오"
]
const sources = ["saramin", "jobkorea", "wanted", "remember", "manual"]
const days = [
  21, 21, 20, 20, 19, 19, 19, 16, 16, 15, 15, 14, 14, 13, 12, 12, 9, 8, 7, 6, 5, 2, 1, 1
]
const records = days.map((day, i) => ({
  id: `promo-${i}`,
  platform: sources[i % sources.length],
  sourceApplicationId: `promo-${i}`,
  companyName: companies[i % companies.length],
  normalizedCompanyName: companies[i % companies.length],
  jobTitle: ["프론트엔드 개발자", "웹 서비스 개발자", "프로덕트 엔지니어", "서비스 기획자"][i % 4],
  appliedAt: `2026-10-${String(day).padStart(2, "0")}`,
  status: "applied",
  evidence: i % 5 === 4 ? "manual" : "history_page",
  ...(i % 5 === 4 ? { sourceLabel: "기업 채용 페이지" } : {}),
  readStatus: i % 4 === 0 ? "unread" : i % 4 === 3 ? "unknown" : "read",
  collectedAt: now,
  lastSeenAt: now,
  lastSyncedAt: now
}))
const links = records.map((record) => ({ id: randomUUID(), recordId: record.id, aliases: [] }))
const checklist = (texts) =>
  texts.map((text, index) => ({ id: randomUUID(), text, done: index === 0 }))
const noteData = [
  [
    "모닝랩 · 1차 면접 준비",
    "면접에서 물어볼 것\n• 팀의 협업 방식과 역할\n• 피드백을 반영하는 과정\n• 입사 후 처음 맡을 업무\n프로젝트 성과는 숫자와 사례로!",
    "yellow",
    0,
    ["프로젝트 발표 연습", "자기소개 1분으로 정리"]
  ],
  [
    "온길스튜디오 · 기업 조사",
    "서비스를 직접 써 보고 기록해요.\n좋았던 점: 짧고 명확한 가입 과정\n더 알아볼 점: 제품의 고객과 목표\n지원 동기에 내 경험 연결하기.",
    "cream",
    1,
    ["서비스 둘러보기", "채용 공고 다시 읽기"]
  ],
  [
    "새봄컴퍼니 · 면접 복기",
    "잘 전달한 이야기\n공통 컴포넌트를 정리했던 경험.\n다음에 보완할 점\n의사결정의 근거를 구체적으로!\n다음 면접에서 활용할 사례 정리.",
    "sage",
    2,
    ["질문과 답변 정리", "보완할 경험 추가"]
  ],
  [
    "이번 주 취업 준비",
    "이번 주에는 지원 개수보다\n직무와 경험이 잘 맞는 공고에 집중하기.\n\n지원 전에 이전 이력 확인!\n자기소개서는 제출 전 한 번 더 읽기.",
    "lavender",
    undefined,
    ["포트폴리오 링크 확인", "관심 기업 공고 확인"]
  ],
  [
    "한걸음테크 · 과제 메모",
    "구현 전에 먼저 정리할 것\n\n1. 사용자가 해결하려는 문제\n2. 화면별 필수 기능\n3. 예외 상황과 안내 문구\n\n마감 하루 전까지 검토 끝내기.",
    "rose",
    3,
    ["요구사항 정리", "접근성 확인"]
  ],
  [
    "다음 면접에서 물어볼 질문",
    "• 팀에서 최근 해결한 기술적 문제는?\n• 새로운 팀원에게 기대하는 역할은?\n• 제품의 우선순위는 어떻게 정하나요?\n\n함께 일하는 모습을 상상해 보기.",
    "cream",
    undefined,
    []
  ]
]
const notes = noteData.map(([title, body, color, linked, tasks], index) => ({
  id: randomUUID(),
  title,
  body,
  color,
  pinned: index === 0,
  checklist: checklist(tasks),
  ...(linked === undefined ? {} : { linkId: links[linked].id }),
  revision: 1,
  createdAt: now,
  updatedAt: now
}))
const eventData = [
  [
    "모닝랩 1차 면접",
    "interview",
    22,
    "14:00",
    0,
    "온라인 면접",
    "프로젝트 경험과 협업 과정을 구체적인 사례로 준비하기."
  ],
  [
    "한걸음테크 과제 제출",
    "assignment",
    23,
    "18:00",
    3,
    "",
    "실행 방법과 주요 의사결정을 README에 정리하기."
  ],
  [
    "온길스튜디오 코딩테스트",
    "assessment",
    24,
    "10:00",
    1,
    "온라인",
    "응시 환경과 접속 안내 확인."
  ],
  [
    "새봄컴퍼니 지원 마감",
    "deadline",
    26,
    "23:59",
    2,
    "",
    "제출 전에 이력서와 포트폴리오 링크 확인하기."
  ],
  ["여백컴퍼니 결과 확인", "result", 28, "11:00", 4, "", "메일과 채용 사이트 지원 현황 확인."],
  [
    "빛길랩 직무 면접",
    "interview",
    29,
    "15:00",
    5,
    "기업 안내 장소",
    "서비스 개선 경험과 지원 동기 준비."
  ]
]
const events = eventData.map(([title, kind, day, time, linked, location, body]) => ({
  id: randomUUID(),
  title,
  kind,
  date: `2026-10-${day}`,
  time,
  status: "planned",
  location,
  body,
  checklist: checklist(["안내 메일 확인", "준비 자료 점검"]),
  linkId: links[linked].id,
  revision: 1,
  createdAt: now,
  updatedAt: now
}))
async function rpc(page, request) {
  const result = await page.evaluate((request) => chrome.runtime.sendMessage(request), request)
  if (!result?.ok) throw new Error(result?.error || "Extension unavailable")
  return result.data
}
async function ready(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.allSettled([...document.images].map((image) => image.decode()))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}
;(async () => {
  fs.mkdirSync(out, { recursive: true })
  const extension = path.join(root, "build/chrome-mv3-prod")
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"), "utf8"))
  if (manifest.version !== version) throw new Error("Build the current extension before capturing")
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1.5,
    timezoneId: "Asia/Seoul",
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  })
  const captures = []
  try {
    // Every recruiting-site request is replaced locally. No account or network data.
    await context.route("https://**/*", (route) => route.abort())
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"))
    const id = new URL(worker.url()).host
    const ui = await context.newPage()
    await ui.clock.setFixedTime(new Date(now))
    await ui.goto(`chrome-extension://${id}/options.html`)
    await expect(ui.locator(".dashboard-overview-top")).toBeVisible()
    const snapshot = await rpc(ui, { type: "snapshot" })
    await rpc(ui, {
      type: "settings",
      settings: { ...snapshot.settings, historyAutoCollect: false }
    })
    await rpc(ui, {
      type: "restore",
      backup: {
        format: "todaystart",
        version: 2,
        exportedAt: now,
        records,
        links,
        notes,
        events,
        board: {
          order: notes.map((note) => note.id),
          sizes: Object.fromEntries(notes.map((note) => [note.id, { width: 344, height: 330 }])),
          revision: 1,
          updatedAt: now
        }
      }
    })
    await expect(ui.locator(".nav-count")).toHaveText(String(records.length))
    const font = fs
      .readFileSync(path.join(root, "assets/branding/PretendardVariable.woff2"))
      .toString("base64")
    const jobHtml = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
      @font-face{font-family:Demo;src:url(data:font/woff2;base64,${font})}*{box-sizing:border-box}body{margin:0;padding:32px;background:#f6f7f9;color:#18181b;font:16px Demo,sans-serif}html[data-theme=dark] body{background:#111827;color:#f2f3f7}a{color:inherit;text-decoration:none}.list_item{background:#fff;border:1px solid #e4e4e7;border-radius:14px;overflow:hidden;padding:20px}html[data-theme=dark] .list_item{background:#1e2430;border-color:#3b4352}.box_item{padding:28px 16px 18px;display:grid;grid-template-columns:1fr auto;gap:16px}.company_nm{font-size:17px;font-weight:650}.notification_info{grid-row:2;grid-column:1}.job_tit{font-size:25px;font-weight:650}.job_meta{margin-top:20px;color:#52525b;font-size:14px}html[data-theme=dark] .job_meta{color:#c1c9d8}.support_info{grid-column:2;grid-row:1/3;align-self:center}.apply-label{background:#1d4ed8;color:#fff;padding:12px 18px;border-radius:8px;font-size:14px}todaystart-warning{display:block}</style>
      <div class="list_body"><div id="rec-991001" class="list_item"><div class="box_item"><div class="col company_nm"><a class="str_tit" href="/zf_user/company-info/view-inner-recruit?csn=landing-company">모닝랩</a></div><div class="col notification_info"><div class="job_tit"><a class="str_tit" id="rec_link_991001" href="/zf_user/jobs/relay/view?rec_idx=991001">프론트엔드 개발자</a></div><div class="job_meta">서울 강남구 · 경력 1년 이상 · 정규직</div></div><div class="col support_info"><span class="apply-label">입사지원</span></div></div><div class="similar_recruit"></div></div></div></html>`
    const jobUrl = "https://www.saramin.co.kr/zf_user/jobs/list/job-category?cat_kewd=84"
    await context.route("https://www.saramin.co.kr/**", (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: jobHtml })
    )
    const jobs = await context.newPage()
    await jobs.setViewportSize({ width: 960, height: 600 })
    await jobs.goto(jobUrl)
    const warning = jobs.locator("todaystart-warning")
    await expect(warning).toHaveCount(1)
    await warning.locator("summary").click()
    for (const theme of ["light", "dark"]) {
      const current = await rpc(ui, { type: "snapshot" })
      await rpc(ui, { type: "settings", settings: { ...current.settings, theme } })
      await expect(ui.locator("html")).toHaveAttribute("data-theme", theme)
      await expect(warning).toHaveAttribute("data-theme", theme)
      await jobs.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      if (!(await warning.locator("details").evaluate((element) => element.open)))
        await warning.locator("summary").click()
      await ready(jobs)
      const warningFile = `warning-${theme}.png`
      await jobs
        .locator(".list_item")
        .screenshot({ path: path.join(out, warningFile), animations: "disabled" })
      captures.push(warningFile)
      for (const [view, label, selector] of [
        ["dashboard", "대시보드", ".app-shell"],
        ["notes", "메모", ".workspace"],
        ["calendar", "취업 캘린더", ".workspace"]
      ]) {
        await ui.getByRole("button", { name: label, exact: true }).click()
        await ready(ui)
        const file = `${view}-${theme}.png`
        if (view === "dashboard")
          await ui.screenshot({ path: path.join(out, file), animations: "disabled" })
        else
          await ui
            .locator(selector)
            .screenshot({ path: path.join(out, file), animations: "disabled" })
        captures.push(file)
      }
    }
    fs.writeFileSync(
      path.join(out, "capture-info.json"),
      JSON.stringify(
        {
          extensionVersion: version,
          capturedAt: new Date().toISOString(),
          clock: now,
          dataset: "fictional",
          account: "temporary isolated profile",
          network: "recruiting requests mocked locally",
          captures
        },
        null,
        2
      )
    )
    console.log(`Captured ${captures.length} light/dark product screens from TodayStart ${version}`)
  } finally {
    await context.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
