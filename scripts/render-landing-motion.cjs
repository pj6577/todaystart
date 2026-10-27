// Run locally with Playwright and FFmpeg. Pages deploys the resulting files without rendering.
const { chromium } = require("@playwright/test")
const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")
const { spawn, spawnSync } = require("node:child_process")

const root = path.resolve(__dirname, "..")
const output = path.join(root, "landing/assets/motion")
const preview = process.argv.includes("--preview")
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg"
const width = 1440
const height = 960
const fps = 30
const duration = 14
// Use standard limited-range BT.709 for consistent dark surfaces in browser decoders.
const color = [
  "-vf",
  "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709",
  "-pix_fmt",
  "yuv420p",
  "-color_range",
  "tv",
  "-colorspace",
  "bt709",
  "-color_trc",
  "bt709",
  "-color_primaries",
  "bt709"
]

async function render() {
  if (!preview && spawnSync(ffmpeg, ["-version"], { stdio: "ignore" }).status !== 0)
    throw new Error("FFmpeg is required. Install it or set FFMPEG_PATH.")
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ channel: "chromium" })
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    // Source and brand assets are local; no account, app storage, or external requests are used.
    await page.route(/^https?:/, (route) => route.abort())
    await page.goto(pathToFileURL(path.join(__dirname, "landing-motion/scene.html")).href)
    await page.evaluate(() =>
      Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())])
    )
    for (const theme of ["dark", "light"]) {
      await page.evaluate(({ theme }) => window.render(12.2, theme), { theme })
      await page.screenshot({ path: path.join(output, `dashboard-${theme}-poster.png`) })
      if (preview) {
        const samples = path.join(root, ".tmp/landing-motion")
        fs.mkdirSync(samples, { recursive: true })
        for (const time of [0.8, 2.5, 4.5, 7, 9.5, 11.5]) {
          await page.evaluate(({ time, theme }) => window.render(time, theme), { time, theme })
          await page.screenshot({ path: path.join(samples, `${theme}-${time}.png`) })
        }
        continue
      }
      const args = [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-framerate",
        String(fps),
        "-i",
        "pipe:0",
        "-an",
        "-map",
        "0:v",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "22",
        ...color,
        "-movflags",
        "+faststart",
        path.join(output, `dashboard-${theme}.mp4`),
        "-an",
        "-map",
        "0:v",
        "-c:v",
        "libvpx-vp9",
        "-crf",
        "32",
        "-b:v",
        "0",
        "-deadline",
        "good",
        "-cpu-used",
        "4",
        "-row-mt",
        "1",
        ...color,
        path.join(output, `dashboard-${theme}.webm`)
      ]
      const encoder = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"], windowsHide: true })
      let log = ""
      encoder.stderr.on("data", (data) => {
        log += data.toString()
      })
      encoder.stdin.on("error", () => {})
      const finished = new Promise((resolve, reject) => {
        encoder.on("error", reject)
        encoder.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error(log || `FFmpeg exited ${code}`))
        )
      })
      // Attach a rejection handler while frames are being produced.
      finished.catch(() => {})
      try {
        for (let frame = 0; frame < fps * duration; frame++) {
          await page.evaluate(({ time, theme }) => window.render(time, theme), {
            time: frame / fps,
            theme
          })
          const buffer = await page.screenshot({ type: "jpeg", quality: 94 })
          await new Promise((resolve, reject) => {
            encoder.stdin.write(buffer, (error) => (error ? reject(error) : resolve()))
          })
          if (frame % (fps * 3) === 0) console.log(`${theme}: ${frame / fps}/${duration}s`)
        }
        encoder.stdin.end()
        await finished
      } catch (error) {
        encoder.kill()
        throw error
      }
    }
    fs.writeFileSync(
      path.join(output, "render-info.json"),
      JSON.stringify(
        {
          source: "scripts/landing-motion/scene.html",
          width,
          height,
          fps,
          duration,
          audio: false,
          data: "fictional presentation data; no account or browser records",
          themes: ["dark", "light"],
          formats: ["webm/vp9", "mp4/h264"],
          posterTime: 12.2
        },
        null,
        2
      ) + "\n"
    )
  } finally {
    await browser.close()
  }
}
render().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
