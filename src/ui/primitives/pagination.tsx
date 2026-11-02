// Adapted from shadcn/ui (MIT); see LICENSE.txt.
import React from "react"
import { cn } from "./utils"

export function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav role="navigation" data-slot="pagination" className={cn("ui-pagination", className)} {...props} />
}
