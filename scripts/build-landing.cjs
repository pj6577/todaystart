const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
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
  ["landing/main.js", "main.js"],
  ["assets/icon.svg", "assets/icon.svg"],
  ["assets/branding/SUIT-Variable.woff2", "assets/SUIT-Variable.woff2"],
  ["assets/branding/SUIT-OFL.txt", "assets/SUIT-OFL.txt"],
  ["docs/images/dashboard.png", "assets/dashboard.png"],
  ["docs/images/cross-site-warning.png", "assets/cross-site-warning.png"],
  ["docs/images/notes.png", "assets/notes.png"],
  ["LICENSE", "LICENSE"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"]
]
for (const [source, target] of files)
  fs.copyFileSync(path.join(root, source), path.join(destination, target))
// Fail the Pages build if a local asset, page or section link is missing.
for (const file of ["index.html", "privacy.html"]) {
  const html = fs.readFileSync(path.join(destination, file), "utf8")
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
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
