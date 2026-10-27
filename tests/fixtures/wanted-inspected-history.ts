// Structural classes from the user's Aside inspection (2026-10-19).
// All values and the two-page navigation handler are synthetic.
export function wantedInspectedHistory(page = 1, api = true, twoPages = false) {
  const rows = [0, 1].map(index => {
    const id = page * 10 + index
    return `<li class="List_List_table_tr__fYmQ9 List_List_table_isReject__sample"><div role="presentation"><div class="List_List_table_td_company_name__u5tEF">가상원티드 ${id}</div><div class="List_List_table_td_position__noXIK">웹 개발자 ${id}</div><div class="List_List_table_td_create_time__srwiA">2026. 9. ${page + index + 10}</div><div class="List_List_table_td_status__sFQdf">불합격</div><div class="List_List_table_td_recommendation__zeGW4">-</div></div></li>`
  }).join("")
  const address = (n: number) => `/status/applications/applied?page=${n}&offset=${(n - 1) * 10}&limit=10`
  const buttons = `<div class="pagination"><button aria-label="Previous page" ${page === 1 ? "disabled" : `onclick="location.href='${address(page - 1)}'"`}>이전</button>${[1, ...(twoPages ? [2] : [])].map(n => `<button ${n === page ? "disabled" : `onclick="location.href='${address(n)}'"`}>${n}</button>`).join("")}<button aria-label="Next page" ${page === 2 || !twoPages ? "disabled" : `onclick="location.href='${address(2)}'"`}>다음</button></div>`
  const script = api ? `<script>fetch('/api/v1/applications?user_id=100&sort=-apply_time,-create_time&status=complete,pass,hire,reject&includes=summary&page=${page}&offset=${(page - 1) * 10}&limit=10').then(()=>document.querySelector('section').setAttribute('data-api-loaded','true'))</script>` : ""
  return `<!doctype html><section class="Body_Body__fq6ma"><div class="List_List_table__1K_8K"><ul>${rows}</ul></div>${buttons}</section>${script}`
}

export function wantedInspectedResponse(page = 1, readAll = false) {
  return { total: 2, applications: [0, 1].map(index => {
    const id = page * 10 + index
    return { id: 800000 + id, company_id: 700000 + id, job_id: 600000 + id, company_name: `가상원티드 ${id}`, job: { position: `웹 개발자 ${id}`, resume: "PRIVATE_RESUME" }, status: "reject", create_time: `2026-09-${page + index + 10}T10:37:48`, open_time: index === 0 || readAll ? "2026-10-19T12:00:00" : null, user_id: "PRIVATE_USER", resume: "PRIVATE_RESUME", email: "PRIVATE_EMAIL" }
  }) }
}
