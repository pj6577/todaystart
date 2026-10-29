// Prepare the approved intro exports for the landing page without changing the originals.
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const root = path.resolve(__dirname, "..")
const sourceDirectory = path.resolve(process.argv[2] || path.join(root, "output/intro-videos"))
const output = path.join(root, "landing/assets/motion")
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg"
const speed = 1.25

fs.mkdirSync(output, { recursive: true })
for (const theme of ["dark", "light"]) {
  const source = path.join(sourceDirectory, `todaystart-intro-${theme}.mp4`)
  if (!fs.existsSync(source)) throw new Error(`Missing approved intro: ${source}`)
  const color = [
    "-vf", `setpts=PTS/${speed},fps=30`,
    "-pix_fmt", "yuv420p", "-color_range", "tv",
    "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709"
  ]
  const result = spawnSync(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", source,
    "-map", "0:v:0", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    ...color, "-movflags", "+faststart", path.join(output, `todaystart-intro-${theme}.mp4`),
    "-map", "0:v:0", "-an", "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0",
    "-deadline", "good", "-cpu-used", "4", "-row-mt", "1",
    ...color, path.join(output, `todaystart-intro-${theme}.webm`)
  ], { encoding: "utf8", windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr || `FFmpeg exited ${result.status}`)
  console.log(`Prepared ${theme} intro at ${speed}x (original unchanged)`)
}
