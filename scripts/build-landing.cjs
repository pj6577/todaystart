const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
// Keep the public page's dark surfaces and text aligned with the actual app.
function cssVariables(file, selector) {
  const source = fs.readFileSync(path.join(root, file), "utf8")
  const start = source.indexOf(selector + " {")
  if (start < 0) throw new Error(`Missing CSS theme: ${file} ${selector}`)
  const block = source.slice(start, source.indexOf("}", start))
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()])
  )
}
const appColors = {
  ...cssVariables("src/style.css", ":root"),
  ...cssVariables("src/style.css", ':root[data-theme="dark"]')
}
const pageColors = cssVariables("landing/styles.css", ':root[data-theme="dark"]')
for (const [page, app] of Object.entries({
  "--page": "--bg",
  "--ink": "--text",
  "--secondary": "--text-secondary",
  "--muted": "--text-muted",
  "--surface": "--surface",
  "--line": "--border",
  "--illustration-line": "--border-strong",
  "--surface-selected": "--selected",
  "--blue": "--accent",
  "--quiet-button": "--accent"
})) {
  if (pageColors[page] !== appColors[app]) throw new Error(`Dark palette differs from app: ${page}`)
}
const destination = path.resolve(root, "build", "landing")
if (destination !== path.join(root, "build", "landing") || !destination.startsWith(root + path.sep))
  throw new Error("Unexpected landing output directory")
// Only this generated subdirectory is replaced. Extension build output is separate.
fs.rmSync(destination, { recursive: true, force: true })
fs.mkdirSync(path.join(destination, "assets"), { recursive: true })
const files = [
  ["landing/index.html", "index.html"],
  ["landing/privacy.html", "privacy.html"],
  ["landing/styles.css", "styles.css"],
  ["landing/theme.js", "theme.js"],
  ["landing/motion.js", "motion.js"],
  ["landing/assets/chrome.svg", "assets/chrome.svg"],
  ["landing/assets/octicons-LICENSE.txt", "assets/octicons-LICENSE.txt"],
  ["assets/icon.svg", "assets/icon.svg"],
  ...[
    "saramin",
    "jobkorea",
    "wanted",
    "remember",
    "jumpit",
    "rallit",
    "programmers",
    "rocketpunch",
    "jobplanet",
    "incruit",
    "catch",
    "jobda",
    "career",
    "work24",
    "albamon",
    "alba",
    "linkareer",
    "gamejob"
  ].map((platform) => [`assets/platforms/${platform}-symbol.png`, `assets/${platform}-symbol.png`]),
  ["assets/branding/SUIT-Variable.woff2", "assets/SUIT-Variable.woff2"],
  ["assets/branding/SUIT-OFL.txt", "assets/SUIT-OFL.txt"],
  ...["light", "dark"].map((theme) => [
    `landing/assets/screens/dashboard-${theme}.png`,
    `assets/dashboard-${theme}.png`
  ]),
  ...["light", "dark"].flatMap((theme) => [
    ...["mp4", "webm"].map((format) => [
      `landing/assets/motion/dashboard-${theme}.${format}`,
      `assets/dashboard-motion-${theme}.${format}`
    ]),
    [
      `landing/assets/motion/dashboard-${theme}-poster.png`,
      `assets/dashboard-motion-${theme}-poster.png`
    ]
  ]),
  ["LICENSE", "LICENSE"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"]
]
for (const [source, target] of files)
  fs.copyFileSync(path.join(root, source), path.join(destination, target))
// Fail the Pages build if a local asset, page or section link is missing.
for (const file of ["index.html", "privacy.html"]) {
  const html = fs.readFileSync(path.join(destination, file), "utf8")
  for (const [, reference] of html.matchAll(/(?:src|href|poster)="([^"]+)"/g)) {
    if (/^https:\/\//.test(reference)) continue
    if (reference.startsWith("#")) {
      if (!html.includes(`id="${reference.slice(1)}"`))
        throw new Error(`Missing section: ${file} -> ${reference}`)
      continue
    }
    const local = path.resolve(destination, reference.split("#")[0])
    if (!local.startsWith(destination + path.sep) && local !== destination)
      throw new Error(`Unexpected link: ${reference}`)
    if (!fs.existsSync(local)) throw new Error(`Missing landing asset: ${file} -> ${reference}`)
  }
}
fs.writeFileSync(path.join(destination, ".nojekyll"), "")
fs.writeFileSync(
  path.join(destination, "robots.txt"),
  "User-agent: *\nAllow: /\nSitemap: https://pj6577.github.io/todaystart/sitemap.xml\n"
)
fs.writeFileSync(
  path.join(destination, "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://pj6577.github.io/todaystart/</loc></url><url><loc>https://pj6577.github.io/todaystart/privacy.html</loc></url></urlset>\n'
)
console.log(
  `Landing built: ${path.relative(root, destination)} (${files.length + 3} files, no extension data)`
)
