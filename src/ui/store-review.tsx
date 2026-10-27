import React from "react"
import { Icon } from "./components"

export function StoreReview() {
  return <section className="settings-section settings-review" aria-labelledby="settings-review-title">
    <div className="settings-section-heading"><h2 id="settings-review-title">오늘시작이 도움이 되었나요?</h2><p>웹 스토어에 남겨 주는 별점과 후기가 큰 힘이 돼요.</p></div>
    <a className="store-review-link" href="https://chromewebstore.google.com/detail/dhgfnibbnjieajcmnohdkiandeljeaef?utm_source=item-share-cb" target="_blank" rel="noopener noreferrer" aria-label="웹 스토어 별점 주기 (새 탭)">
      <svg className="review-star" width="28" height="28" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path d="M17.2 3.8Q18 2.3 18.8 3.8L22.7 11.5Q23 12.2 23.8 12.3L32.4 13.5Q34 13.7 32.8 14.9L26.6 21Q26 21.5 26.2 22.3L27.7 30.8Q28 32.4 26.5 31.6L18.8 27.6Q18 27.2 17.2 27.6L9.5 31.6Q8 32.4 8.3 30.8L9.8 22.3Q10 21.5 9.4 21L3.2 14.9Q2 13.7 3.6 13.5L12.2 12.3Q13 12.2 13.3 11.5Z" fill="#FFD35C" stroke="#D5A027" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M14 16.5v1.8m8-1.8v1.8m-6 3.2q2 2 4 0" stroke="#775014" strokeWidth="1.8" strokeLinecap="round" />
        <ellipse cx="11.5" cy="20" rx="2.1" ry="1.3" fill="#F2A18B" /><ellipse cx="24.5" cy="20" rx="2.1" ry="1.3" fill="#F2A18B" />
      </svg>
      <span>별점 남기기</span><Icon name="external" size={11} />
    </a>
  </section>
}
