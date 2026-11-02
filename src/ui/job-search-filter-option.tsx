import React from "react"
import { Icon } from "./components"
import { Input } from "./primitives/input"

export function FilterOption({ label, checked, onChange, children }: { label: string; checked: boolean; onChange(): void; children: React.ReactNode }) {
  return <label className={`filter-modal-chip${checked ? " selected" : ""}`}><Input className="sr-only" type="checkbox" aria-label={label} checked={checked} onChange={onChange} /><span className="filter-option-check" aria-hidden="true">{checked && <Icon name="check" size={12} />}</span><span>{children}</span></label>
}
