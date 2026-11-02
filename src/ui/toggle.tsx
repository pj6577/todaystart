import React from "react"
import { Sentences } from "./components"
import { Switch } from "./primitives/switch"

export function Toggle({ label, detail, checked, onChange, disabled = false }: { label: string; detail: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return <div className="toggle-row"><div><strong>{label}</strong><p><Sentences>{detail}</Sentences></p></div><Switch aria-label={label} checked={checked} onCheckedChange={onChange} disabled={disabled} /></div>
}
