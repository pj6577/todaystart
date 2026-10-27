// Progressive enhancement: every feature stays readable when JavaScript is off.
const tablist = document.querySelector('[role="tablist"]')
if (tablist) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')]
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")))
  if (tabs.length && panels.every(Boolean)) {
    function selectTab(index, focus = false) {
      tabs.forEach((tab, i) => {
        tab.setAttribute("aria-selected", String(i === index))
        tab.tabIndex = i === index ? 0 : -1
        panels[i].hidden = i !== index
      })
      if (focus) tabs[index].focus()
    }
    tabs.forEach((tab, index) => {
      const panel = panels[index]
      panel.setAttribute("role", "tabpanel")
      panel.setAttribute("aria-labelledby", tab.id)
      panel.tabIndex = 0
      tab.addEventListener("click", () => selectTab(index))
      tab.addEventListener("keydown", (event) => {
        const next = {
          ArrowRight: (index + 1) % tabs.length,
          ArrowLeft: (index + tabs.length - 1) % tabs.length,
          Home: 0,
          End: tabs.length - 1
        }[event.key]
        if (next === undefined) return
        event.preventDefault()
        selectTab(next, true)
      })
    })
    selectTab(0)
    tablist.hidden = false
  }
}
