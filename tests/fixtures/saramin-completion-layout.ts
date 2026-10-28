// Layout rules and positioning order observed in Saramin's public relay page,
// /sri_css/common_ui_keeping.css and setQuickApplyLayerPosition, 2026-10-28.
// Content and completion behavior are synthetic; this never submits an application.
export const saraminCompletionLayoutDetail = `<!doctype html><meta charset="utf-8">
<style>
body { margin:0; font-family:sans-serif }
.wrap_jv_header { padding:24px; background:#f4f6fa }
main { min-height:3000px; padding:50px }
.iframe_layer { display:none; position:absolute; top:0; right:0; bottom:0; left:0; z-index:1000; width:100%; height:100%; background:rgba(0,0,0,.65) }
.once_layer { position:absolute; top:0; bottom:0; left:50%; z-index:1010; margin-left:-400px; width:800px; line-height:0 }
.once_layer iframe { width:100%; height:100%; border:0 }
.once_ly_close { position:absolute; top:50%; left:50%; z-index:10; margin:-360px 0 0 360px; width:32px; height:32px; background:white }
</style>
<div class="wrap_jv_header"><div class="jv_header"><div class="title_inner"><a class="company">가상 제출 기업</a></div><h1 class="tit_job">웹 개발자</h1></div></div>
<main>${'<p>공고 본문과 근무 조건</p>'.repeat(90)}<button id="open-completion">완료 화면 열기</button></main>
<div id="iframe_layer" class="iframe_layer"><div id="quick_apply_layer" class="once_layer type_width01">
<iframe id="quick_apply_frame" name="quick_apply_frame" title="지원 완료" src="about:blank"></iframe>
<button class="once_ly_close" aria-label="지원 완료창 닫기">×</button></div></div>
<script>
document.querySelector('#open-completion').onclick=()=>{
 document.documentElement.style.overflow='hidden';
 const layer=document.querySelector('#iframe_layer');
 layer.style.top=scrollY+'px';layer.style.width=innerWidth+'px';layer.style.height=innerHeight+'px';layer.style.display='block';
 document.querySelector('iframe').contentWindow.location.replace('/zf_user/member/apply/complete?rec_idx=12345&recruitapply_idx=7788&recommend_recruit=y');
};
document.querySelector('.once_ly_close').onclick=()=>{
 document.querySelector('#iframe_layer').style.display='none';document.documentElement.style.overflow='';
};
</script>`

export const saraminCompletionLayoutFrame = `<!doctype html><meta charset="utf-8"><style>
body { margin:0; font:16px sans-serif }
.panel { position:absolute; top:50%; transform:translateY(-50%); box-sizing:border-box; padding:40px; width:800px; height:608px; border-radius:16px; background:white }
</style><div class="panel"><h1>입사지원 완료!</h1><p>지원 현황에서 확인할 수 있습니다.</p><button>추천 공고 확인</button></div>`
