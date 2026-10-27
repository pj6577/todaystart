// The endpoints/form ID come from the user's investigation. All employer data,
// payloads and behavior here are synthetic; no real application is submitted.
export function saraminSubmissionPage(transport: "fetch" | "xhr") {
  return `<h1>가상 지원창</h1><button id="open-check">지원창 조건 확인</button><button id="final">입사지원</button><p id="result"></p><script>
    document.querySelector('#open-check').onclick=()=>fetch('/zf_user/member/apply/check-open-layer-condition',{method:'POST'});
    document.querySelector('#final').onclick=()=>{
      const show=text=>document.querySelector('#result').textContent=text;
      ${transport === "fetch" ? "fetch('/zf_user/member/apply/apply',{method:'POST',body:'resume=PRIVATE_RESUME&token=PRIVATE_TOKEN'}).then(r=>r.text()).then(show).catch(()=>show('network error'));" : "const xhr=new XMLHttpRequest();xhr.open('POST','/zf_user/member/apply/apply');xhr.onload=()=>{show(xhr.responseText);if(JSON.parse(xhr.responseText).code==='success')window.frameElement?.remove()};xhr.send('resume=PRIVATE_RESUME&token=PRIVATE_TOKEN');"}
    };
  </script>`
}
export function saraminSubmissionDetail(transport: "fetch" | "xhr") {
  return `<main class="wrap_jv_header"><header class="jv_header"><div class="title_inner"><a class="company">가상 제출 기업</a></div><h1 class="tit_job">웹 개발자</h1></header></main><iframe title="지원창" src="/zf_user/member/apply?rec_idx=12345&transport=${transport}"></iframe>`
}
export const jobkoreaSubmissionDetail = `<main><header data-sentry-component="Title"><div><div><section data-sentry-component="CompanyName"><h2>가상 제출 기업</h2></section><section data-sentry-component="TitleContent"><h1>웹 개발자</h1></section></div></div></header><a target="_blank" href="/Recruit/OnPass?giNo=12345">지원창 열기</a></main>`
export const jobkoreaSubmissionPage = `<h1>가상 지원창</h1><form id="devForm" method="post" action="/Recruit/OnPass/OnPassApply"><input type="hidden" name="resume" value="PRIVATE_RESUME"><button type="button" class="footer-btn dev-btn-apply">지원하기</button></form><script>document.querySelector('button').onclick=()=>document.querySelector('form').submit();</script>`
