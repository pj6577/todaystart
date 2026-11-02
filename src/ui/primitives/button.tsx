// Adapted from shadcn/ui (MIT); see LICENSE.txt.
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "./utils"

export const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      default: "ui-button-primary",
      outline: "ui-button-outline",
      secondary: "ui-button-secondary",
      destructive: "ui-button-danger",
      ghost: "ui-button-ghost",
      link: "ui-button-link",
      unstyled: "ui-button-unstyled"
    },
    size: { default: "ui-button-md", sm: "ui-button-sm", lg: "ui-button-lg", icon: "ui-button-icon" }
  },
  defaultVariants: { variant: "outline", size: "default" }
})
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "outline", size = "default", asChild = false, type, ...props }, ref) => {
  const Component = asChild ? Slot : "button"
  return <Component data-slot="button" data-variant={variant} data-size={size} className={cn(buttonVariants({ variant, size }), className)} type={asChild ? undefined : type || "button"} ref={ref} {...props} />
})
Button.displayName = "Button"
