// Adapted from shadcn/ui (MIT); see LICENSE.txt.
import * as React from "react"
import { cn } from "./utils"

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => {
  const native = ["checkbox", "radio", "range", "color", "hidden", "file"].includes(type || "")
  return <input type={type} className={cn(!native && "ui-input", className)} data-slot="input" ref={ref} {...props} />
})
Input.displayName = "Input"

// Retain native form submission, keyboard navigation and date/select behaviour
// in existing editors. Search filters use labelled option groups in a dialog.
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => <select className={cn("ui-input ui-select", className)} data-slot="select" ref={ref} {...props} />)
NativeSelect.displayName = "NativeSelect"
