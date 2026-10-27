import React, { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { recruitmentBrands } from "./recruitment-brands"

// A decorative miniature of application records. It contains no platform
// branding or user data, so the introduction also fits future integrations.
function RecordPill() {
  return <span className="dashboard-record-pill" aria-hidden="true">
    <svg viewBox="0 0 96 36" focusable="false">
      <rect width="96" height="36" rx="18" fill="var(--surface-hover)" />
      <rect x="15" y="8" width="28" height="25" rx="3" transform="rotate(-13 29 20.5)" fill="#fff" stroke="#d4d4d8" />
      <rect x="54" y="6" width="28" height="25" rx="3" transform="rotate(12 68 18.5)" fill="#fff" stroke="#d4d4d8" />
      <path d="M62 12h10m-10 4h14m-14 4h10" stroke="#d4d4d8" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="33" y="4" width="30" height="28" rx="4" fill="#fff" stroke="#d4d4d8" />
      <rect x="38" y="9" width="12" height="2" rx="1" fill="#71717a" />
      <path d="M38 15h20m-20 4h15" stroke="#d4d4d8" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="38" y="23" width="14" height="4" rx="2" fill="var(--accent)" />
    </svg>
  </span>
}

export function DashboardHero() {
  return <div className="dashboard-hero">
    <h1 className="dashboard-hero-headline" aria-label="여러 곳에 남긴 지원 기록을 한곳에서 확인해요"><span className="dashboard-hero-records">여러 곳에 남긴 <RecordSites /></span><span className="dashboard-hero-records">지원 기록을</span><br />한곳에서 확인해요</h1>
    <p>어디에, 언제 지원했는지 한눈에 살펴보세요.</p>
  </div>
}

function RecordSites() {
  const [open, setOpen] = useState(false)
  const [shift, setShift] = useState(0)
  const wrapper = useRef<HTMLSpanElement>(null)
  const cloud = useRef<HTMLSpanElement>(null)
  const id = useId()

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const trigger = wrapper.current, bubbles = cloud.current
      if (!trigger || !bubbles) return
      const box = trigger.getBoundingClientRect()
      const left = box.left + box.width / 2 - bubbles.offsetWidth / 2
      const clampedLeft = Math.max(16, Math.min(left, window.innerWidth - bubbles.offsetWidth - 16))
      setShift(clampedLeft - left)
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [open])

  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false)
    }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false) }
    document.addEventListener("pointerdown", outside)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", outside)
      document.removeEventListener("keydown", escape)
    }
  }, [open])

  return <span className="dashboard-record-cluster" ref={wrapper}
    onPointerEnter={event => { if (event.pointerType !== "touch") setOpen(true) }}
    onPointerLeave={event => { if (event.pointerType !== "touch") setOpen(false) }}>
    <button type="button" className="dashboard-record-trigger" aria-label="채용 사이트 심벌 보기"
      aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined}
      onClick={() => setOpen(current => !current)}
      onFocus={event => { if (event.currentTarget.matches(":focus-visible")) setOpen(true) }}
      onBlur={() => setOpen(false)}><RecordPill /></button>
    <span id={id} ref={cloud} className="dashboard-platform-bubbles" role="tooltip" aria-hidden={!open} data-open={open}
      style={{ "--bubble-shift": `${shift}px` } as CSSProperties}>
      {recruitmentBrands.filter(brand => ["saramin", "jobkorea", "wanted"].includes(brand.id)).map((brand, index) => <span className="dashboard-site-bubble" key={brand.id}
        style={{ "--bubble-order": index, "--bubble-rise": index === 1 ? "-7px" : "0px", "--bubble-tilt": `${(index - 1) * 9}deg` } as CSSProperties}>
        <img src={brand.symbol} alt={`${brand.label} 로고`} width={30} height={30} />
      </span>)}
    </span>
  </span>
}
