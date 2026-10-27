// Only a display preference is stored; this site never reads extension records.
;(() => {
  const key = "todaystart-landing-theme"
  const modes = new Set(["system", "dark", "light"])
  const system = window.matchMedia("(prefers-color-scheme: dark)")
  let mode = "dark"
  try {
    const saved = localStorage.getItem(key)
    if (modes.has(saved)) mode = saved
  } catch {
    // The picker still works when browser storage is blocked.
  }
  function apply() {
    const theme = mode === "system" ? (system.matches ? "dark" : "light") : mode
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.themeMode = mode
    const color = document.querySelector('meta[name="theme-color"]')
    if (color) color.content = theme === "dark" ? "#09090b" : "#ffffff"
    document.querySelectorAll("[data-theme-select]").forEach((select) => {
      select.value = mode
    })
  }
  apply()
  system.addEventListener("change", () => {
    if (mode === "system") apply()
  })
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return
    mode = modes.has(event.newValue) ? event.newValue : "dark"
    apply()
  })
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-theme-select]").forEach((select) => {
      select.value = mode
      select.closest(".theme-control").hidden = false
      select.addEventListener("change", () => {
        if (!modes.has(select.value)) return
        mode = select.value
        apply()
        try {
          localStorage.setItem(key, mode)
        } catch {
          // The chosen mode remains active for this page without persistence.
        }
      })
    })
  })
})()
