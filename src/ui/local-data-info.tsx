import React from "react"
import { Icon } from "./components"

export function LocalDataInfo() {
  return <section className="settings-section local-data-info" aria-labelledby="local-data-title">
    <div className="local-data-heading">
      <span className="local-data-symbol"><Icon name="shield" size={23} /></span>
      <div><h2 id="local-data-title">내 기록은 이 브라우저에만 저장돼요</h2><p>지원 기록과 메모, 일정은 내 기기에 보관해요. 오늘시작의 서버로 전송하지 않아요.</p></div>
    </div>
    <div className="local-data-details">
      <div><Icon name="monitor" size={18} /><div><h3>브라우저마다 따로 보관해요</h3><p>다른 기기나 브라우저에 자동으로 동기화되지 않아요.</p></div></div>
      <div><Icon name="download" size={18} /><div><h3>옮길 때는 JSON 백업을 이용해요</h3><p>아래 ‘백업과 복원’에서 기록을 파일로 보관하고 다시 불러올 수 있어요.</p></div></div>
    </div>
  </section>
}
