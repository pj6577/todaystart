import React, { useRef } from "react"
import { Dialog, DialogContent } from "./dialog"

export { DialogTitle as ModalTitle } from "./dialog"

type ModalProps = React.ComponentPropsWithoutRef<typeof DialogContent> & {
  onClose(): void
  busy?: boolean
  dismissOutside?: boolean
}

export function Modal({ onClose, busy = false, dismissOutside = false, children, ...props }: ModalProps) {
  const previousFocus = useRef(document.activeElement as HTMLElement | null)
  const content = useRef<HTMLDivElement>(null)
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent ref={content} showClose={false} aria-describedby={undefined}
      onOpenAutoFocus={event => {
        const target = content.current?.querySelector<HTMLElement>('[data-autofocus],input:not([type="checkbox"]):not([type="radio"]),textarea,select')
        if (target) { event.preventDefault(); target.focus() }
      }}
      onCloseAutoFocus={event => { event.preventDefault(); if (previousFocus.current?.isConnected) previousFocus.current.focus() }}
      onEscapeKeyDown={event => { if (busy || event.isComposing) event.preventDefault() }}
      onInteractOutside={event => { if (!dismissOutside || busy) event.preventDefault() }} {...props}>
      {children}
    </DialogContent>
  </Dialog>
}
