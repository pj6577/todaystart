// A silent, local product illustration. Only the active theme's video is loaded.
;(() => {
  const video = document.querySelector("[data-motion-video]")
  const button = document.querySelector("[data-motion-toggle]")
  if (!video || !button) return
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
  const formats = video.canPlayType('video/mp4; codecs="avc1.640028"')
    ? ["mp4", "webm"]
    : ["webm", "mp4"]
  let preference = null
  let inView = false
  let sourceTheme = null
  let resumeTime = 0
  let formatIndex = 0
  let failed = false
  video.muted = true

  const theme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark")
  const wantsMotion = () => preference === "play" || (preference !== "pause" && !reduced.matches)
  function updateButton() {
    const playing = !video.paused && !video.ended
    button.dataset.playing = String(playing)
    button.title = button.ariaLabel = playing ? "영상 일시정지" : "영상 재생"
  }
  function ensureSource() {
    if (sourceTheme === theme()) return
    resumeTime = Number.isFinite(video.currentTime) ? video.currentTime : 0
    sourceTheme = theme()
    video.dataset.ready = "false"
    const format = formats[formatIndex]
    video.src = `./assets/dashboard-motion-${sourceTheme}.${format}`
    video.load()
  }
  async function sync() {
    if (!inView || document.hidden || !wantsMotion() || failed) {
      video.pause()
      if (reduced.matches && preference !== "play") video.dataset.ready = "false"
      updateButton()
      return
    }
    ensureSource()
    try {
      await video.play()
    } catch {
      // If autoplay is unavailable, the same icon lets the visitor start playback.
    }
    updateButton()
  }
  video.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(video.duration) && resumeTime > 0)
      video.currentTime = Math.min(resumeTime, Math.max(0, video.duration - 0.1))
  })
  video.addEventListener("playing", () => {
    if (sourceTheme === theme()) video.dataset.ready = "true"
    updateButton()
  })
  video.addEventListener("pause", updateButton)
  video.addEventListener("error", () => {
    if (formatIndex === 0) {
      formatIndex = 1
      sourceTheme = null
      sync()
    } else {
      failed = true
      video.dataset.ready = "false"
      button.hidden = true
    }
  })
  button.addEventListener("click", () => {
    preference = video.paused ? "play" : "pause"
    sync()
  })
  new MutationObserver(() => {
    if (sourceTheme !== theme()) {
      video.pause()
      video.dataset.ready = "false"
    }
    sync()
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
  new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting
      sync()
    },
    { threshold: 0.01 }
  ).observe(video.parentElement)
  document.addEventListener("visibilitychange", sync)
  reduced.addEventListener("change", sync)
  button.hidden = false
  updateButton()
})()
