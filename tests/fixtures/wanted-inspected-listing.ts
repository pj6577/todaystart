// Reduced from the user's 2026-11-02 /wdlist DOM. No network assets or scripts.
export function wantedCard(id: number, company: string, title: string) {
  return `<li class="Card_Card__aaatv"><div data-cy="job-card" class="JobCard_JobCard__aVx71"><a href="/wd/${id}">
    <div class="JobCard_JobCard__thumb__iOtFn"><span>합격보상금 100만원</span>
      <button type="button" aria-label="bookmark button" data-attribute-id="position__bookmark__click" data-company-name="${company}" data-position-id="${id}" data-position-name="${title}"></button>
    </div><div class="JobCard_JobCard__body__KVSqk"><span class="JobCard_JobCard__body__position__NLhOu">${title}</span><span class="CompanyNameWithLocationPeriod_CompanyNameWithLocationPeriod__company__ByVLu">${company}</span><span>서울 강남구 · 신입-경력 4년</span></div>
  </a></div></li>`
}
export const wantedInspectedListing = `<ul data-cy="job-list" class="List_List__Zx2dt">
  ${wantedCard(306913, "미리디", "[커머스 플랫폼] QA 엔지니어")}
  ${wantedCard(395998, "파이브레인에이아이", "AI Robot Engineer(S/W)")}
  ${wantedCard(395896, "문토", "소프트웨어 엔지니어 (AI 캐릭터챗)|신사업 팀")}
  <div aria-hidden="true"></div>
</ul>`
