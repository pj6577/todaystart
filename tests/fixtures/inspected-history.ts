// Reconstructed from the DOM inspection supplied by the user on 2026-10-19:
// https://share.aside.com/s/GXGsjqrAS4ByDXrN
// Structural classes/attributes follow that evidence. All record values below
// are invented, and this is not a capture of the user's account or live test.
export const inspectedFilters = {
  jobkorea: "From_Dt=2026-07-21&To_Dt=2026-10-19&StatusStat=0&Order_Apply=0&IngStat=0&ReadStat=0",
  saramin: "pageCount=20&search_period=1&start_date=2026-09-19&end_date=2026-10-19&read_status=tot&order_type=update"
}

export function inspectedHistory(platform: "jobkorea" | "saramin", page = 1) {
  const rows = Array.from({ length: page === 1 ? 20 : platform === "jobkorea" ? 1 : 12 }, (_, index) => {
    const id = page * 100 + index, jobId = 90000000 + id
    if (platform === "jobkorea") return `<tr>
      <td rowspan="2"><div class="apply-status"><div class="status">지원완료</div><div class="date">2026.10.01</div></div></td>
      <td><div class="apply-board"><div class="inner">
        <div class="company"><a href="/Recruit/Co_read/C/${70000000 + id}">가상기업 ${id}</a></div>
        <div class="description"><a href="/Recruit/GI_Read/${jobId}?Oem_Code=C1">개발자 ${id} (~10/30)</a></div>
        <div class="meta"><div class="applicants-field">지원분야 : 개발</div><div class="applicants-number">지원자수 : <a href="#">117</a>명</div></div>
      </div></div></td>
      <td><div class="apply-progress"><div class="status">진행중</div><div class="extra">(~10/30)</div></div></td>
      <td><div class="reading"><div class="read-not">열람</div><div class="date">${index < 8 ? "2026.10.01" : "2026.10.19"}</div></div></td>
      <td><button data-idx="${80000000 + id}" data-memsysno="${70000000 + id}" data-gno="${jobId}" data-gino="${60000000 + id}" data-memname="가상기업 ${id}" data-gititle="개발자 ${id}" data-applydate="20261001123456">지원취소</button></td>
    </tr><tr><td colspan="4"><div>유사한 추천공고</div>${[1, 2, 3].map(n => `<a href="/Recruit/GI_Read/${50000000 + id * 10 + n}">추천 직무 ${n}</a>`).join("")}</td></tr>`
    return `<div class="row _apply_list" data-recruitapply_idx="${80000000 + id}" data-csn="${70000000 + id}" data-rec_idx="${jobId}" data-company_nm="가상기업 ${id}" data-recruittitle="개발자 ${id}" data-rec_division="지원 분야 ${id}">
      <div class="col_date">2026.10.01 12:34</div><div class="col_summary">
      <strong class="corp"><a href="/zf_user/company-info/view?csn=${70000000 + id}">가상기업 ${id}</a></strong>
      <div class="recruit"><a href="/zf_user/jobs/relay/view?rec_idx=${jobId}"><span class="division">지원 분야 ${id}</span><div class="TipBox">개발자 ${id}<div class="TipCont">해당 공고는 삭제되었습니다</div></div></a></div>
      <div class="status"><em class="txt_status">지원완료</em><span class="txt_sub">${index % 2 ? "점핏 제공 공고" : "미열람"}</span></div></div>
      <div class="col_btns"><button>지원취소</button><button>지원내역</button></div><div class="col_history"><ol class="timeline"><li>2026.10.19 지원서 열람</li></ol></div></div>`
  }).join("")
  if (platform === "jobkorea") {
    const pagination = [1, 2].map(n => `<li>${page === n ? `<span class="now">${n}</span>` : `<a data-page="${n}" href="/user/applymng?${inspectedFilters.jobkorea}&Page=${n}">${n}</a>`}</li>`).join("")
    return `<!doctype html><div class="applyCont"><h2>입사지원 현황</h2><div class="applymng-list"><table class="table"><thead><tr><th><button>지원일</button></th><th>지원내역</th><th>공고진행상태</th><th>열람</th><th>취소/삭제</th></tr></thead><tbody>${rows}</tbody></table></div><div class="tplPagination"><ul>${pagination}</ul></div></div>`
  }
  const pagination = [1, 2].map(n => page === n ? `<span class="BtnType SizeS">${n}</span>` : `<a class="BtnType SizeS" data-page="${n}" page="${n}" href="/zf_user/persons/apply-status-list/page/${n}?page=${page}&${inspectedFilters.saramin}"><span>${n}</span></a>`).join("")
  return `<!doctype html><div id="apply_status_list_div"><form id="list_form"><div class="list_status">${rows}</div></form><div class="PageBox">${pagination}</div></div>`
}
