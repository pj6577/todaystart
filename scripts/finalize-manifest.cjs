const fs = require("node:fs")
const path = require("node:path")

// Plasmo 0.90's Parcel manifest schema rejects the native `world` key. Keep
// static Chrome registration (no scripting permission/startup race) and apply
// this one supported MV3 field after bundling. Never infer a script by hash.
function finalize() {
const manifestPath = path.resolve(process.env.TODAYSTART_MANIFEST_DIR || "build/chrome-mv3-prod", "manifest.json")
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
const expected = ["https://www.saramin.co.kr/zf_user/member/apply*", "https://www.jobkorea.co.kr/Recruit/OnPass*", "https://www.jobkorea.co.kr/Recruit/GI_Read/*", "https://www.jobkorea.co.kr/Search*", "https://www.jobkorea.co.kr/Recruit/JobList*"]
const entries = manifest.content_scripts.filter(entry => JSON.stringify(entry.matches) === JSON.stringify(expected))
if (entries.length !== 1 || entries[0].js.length !== 1 || !entries[0].all_frames || entries[0].run_at !== "document_start") throw new Error("Submission observer entry is missing or ambiguous")
if (manifest.permissions.includes("scripting")) throw new Error("Unexpected dynamic scripting permission")
if (!fs.existsSync(path.resolve(path.dirname(manifestPath), entries[0].js[0]))) throw new Error("Submission observer bundle is missing")
entries[0].world = "MAIN"
fs.writeFileSync(manifestPath, JSON.stringify(manifest))
// Keep the local font's redistribution license with every production/dev bundle.
fs.copyFileSync(path.resolve(__dirname, "../assets/branding/Pretendard-OFL.txt"), path.join(path.dirname(manifestPath), "Pretendard-OFL.txt"))
for (const notice of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) fs.copyFileSync(path.resolve(__dirname, "..", notice), path.join(path.dirname(manifestPath), notice))
console.log("Static MAIN-world submission observer registered; permissions unchanged.")
}
module.exports = finalize
if (require.main === module) finalize()
