import React from "react"
import paperPlane from "url:../../assets/dashboard/encouragement-plane.png"

export function DashboardEncouragement() {
  return <section className="encouragement-banner" aria-labelledby="encouragement-title">
    <div><h2 id="encouragement-title">오늘도 한 걸음,<br />수고했어요.</h2><p>잠깐 쉬어 가도 괜찮아요.</p></div>
    <img src={paperPlane} alt="" width={176} height={176} />
  </section>
}
