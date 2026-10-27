import { useEffect } from "react"
import type { Settings } from "../storage/settings"

export function useTheme(theme: Settings["theme"] = "system") {
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
}
