import React, { type ReactNode } from "react"
import { sourceLabel, type ApplicationSource } from "../core/model"
import { sentenceLines } from "./sentences"
import appIcon from "url:../../assets/icon.png"

export function Icon({ name, size = 20 }: { name: "grid" | "list" | "calendar" | "note" | "settings" | "arrow" | "search" | "download" | "refresh" | "check" | "shield" | "close" | "more" | "external" | "clock" | "sun" | "moon" | "monitor"; size?: number }) {
  const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    list: "M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01",
    calendar: "M4 5h16v16H4zM4 10h16M8 3v4m8-4v4M8 14h2m4 0h2M8 17h2",
    note: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
    settings: "m9 3-.5 3-2 1.2L3.7 6l-2 3.5L4 11v2l-2.3 1.5 2 3.5 2.8-1.2 2 1.2.5 3h4l.5-3 2-1.2 2.8 1.2 2-3.5L18 13v-2l2.3-1.5-2-3.5-2.8 1.2-2-1.2-.5-3z M14 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    arrow: "M5 12h14m-6-6 6 6-6 6", search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    download: "M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5", refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15",
    check: "m5 12 4 4L19 6", shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z m-4 9 3 3 5-6", close: "m6 6 12 12M6 18 18 6", more: "M5 12h.01M12 12h.01M19 12h.01",
    external: "M14 3h7v7m0-7-9 9M10 3H4v17h17v-6",
    clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    moon: "M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12",
    monitor: "M3 4h18v13H3zM12 17v4m-5 0h10"
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
export function Brand() { return <div className="brand"><img className="brand-mark" src={appIcon} width={31} height={31} alt="" /><span>오늘시작</span></div> }
export function PlatformTag({ platform, label }: { platform: ApplicationSource; label?: string }) { return <span className={`platform-tag ${platform}`}>{sourceLabel({ platform, sourceLabel: label })}</span> }
export function Sentences({ children }: { children: string }) { return <span className="sentence-lines">{sentenceLines(children)}</span> }
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={`notice sentence-lines ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{typeof children === "string" ? sentenceLines(children) : children}</div> }
export function Toggle({ label, detail, checked, onChange, disabled = false }: { label: string; detail: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return <div className="toggle-row"><div><strong>{label}</strong><p><Sentences>{detail}</Sentences></p></div><button className={`toggle ${checked ? "on" : ""}`} role="switch" aria-label={label} aria-checked={checked} onClick={onChange} disabled={disabled}><span /></button></div>
}
