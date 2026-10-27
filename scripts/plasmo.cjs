const { spawn } = require("node:child_process")
const path = require("node:path")
const mode = process.argv[2]
if (!["dev", "build"].includes(mode)) throw new Error("Expected dev or build")
const root = path.resolve(__dirname, "..")
const bin = path.resolve(root, "node_modules/plasmo", require("plasmo/package.json").bin)
const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], {
  cwd: root, stdio: "inherit", env: {
    ...process.env,
    POST_BUILD_SCRIPT: path.join(__dirname, "finalize-manifest.cjs"),
    TODAYSTART_MANIFEST_DIR: path.join(root, "build", `chrome-mv3-${mode === "dev" ? "dev" : "prod"}`)
  }
})
child.on("error", error => { console.error(error); process.exitCode = 1 })
child.on("exit", (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exitCode = code ?? 1 })
