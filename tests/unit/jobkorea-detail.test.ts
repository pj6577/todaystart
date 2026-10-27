import { afterEach, expect, it, vi } from "vitest"
import { DomPlatformAdapter } from "../../src/platforms/adapter"
import { hasJobkoreaCompletion, hasJobkoreaCompletionTransition } from "../../src/submission/completion-marker"

const url = "https://www.jobkorea.co.kr/Recruit/GI_Read/50167228"
const title = "[셀파트너랩스] AI 커머스 스타트업 프론트엔드 개발자 모집"
function currentDetail(documentTitle = `㈜셀파트너랩스 채용 - ${title} | 잡코리아`) {
  const doc = new DOMParser().parseFromString(`<title>${documentTitle}</title><main><div data-sentry-component="Title"><div><div data-sentry-component="TitleContent"><h1>${title}</h1></div></div></div><aside><h2>추천 기업</h2></aside></main>`, "text/html")
  Object.defineProperty(doc, "URL", { value: url })
  return doc
}
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = "" })
it("회사명이 sticky Title 밖에 있는 현재 공고에서도 문서 제목과 실제 h1을 대조해 읽는다", () => {
  const postings = new DomPlatformAdapter("jobkorea").extractJobPostings(currentDetail())
  expect(postings).toHaveLength(1)
  expect(postings[0]).toMatchObject({ companyName: "㈜셀파트너랩스", jobTitle: title, sourceJobId: "50167228", jobUrl: url })
})
it.each(["다른회사 채용 - 다른 공고 | 잡코리아", `회사 미상 - ${title} | 잡코리아`, `채용 - ${title} | 잡코리아`])("문서 제목이 오래됐거나 회사 식별 구분이 없으면 추측하지 않는다: %s", documentTitle => {
  expect(new DomPlatformAdapter("jobkorea").extractJobPostings(currentDetail(documentTitle))).toEqual([])
})
it("추천 기업만 있는 상세 페이지에서는 공고 정보를 만들지 않는다", () => {
  const doc = currentDetail()
  doc.querySelector('[data-sentry-component="Title"]')?.remove()
  expect(new DomPlatformAdapter("jobkorea").extractJobPostings(doc)).toEqual([])
})
function completion(html: string) {
  document.body.innerHTML = html
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
  return hasJobkoreaCompletion(document)
}
it("추가지원 완료 속성과 문구가 맞으면 바뀐 레이아웃 클래스에도 완료를 감지한다", () => {
  expect(completion('<button class="new-react-layout" data-applymode="ONLINE" data-activity="APPLY_COMPLETE"><span>추가지원</span></button>')).toBe(true)
})
it.each([
  '<button disabled data-applymode="ONLINE">추가지원</button>',
  '<button data-activity="APPLY_COMPLETE">추가지원</button>',
  '<button data-applymode="ONLINE" data-activity="APPLY_COMPLETE">지원하기</button>',
  '<div hidden><button data-applymode="ONLINE" data-activity="APPLY_COMPLETE">추가지원</button></div>',
  '<div style="display:none"><button data-applymode="ONLINE" data-activity="APPLY_COMPLETE">추가지원</button></div>'
])("완료의 두 속성·문구·보임 근거가 부족하면 확정하지 않는다: %s", html => expect(completion(html)).toBe(false))

it("최종 클릭 뒤 같은 버튼이 추가지원으로 바뀌면 추적 속성이 없어도 전환을 감지한다", () => {
  completion('<button class="changed-layout">지원하기</button>')
  const before = new Set<Element>()
  document.querySelector("button")!.textContent = "추가지원"
  expect(hasJobkoreaCompletionTransition(document, before)).toBe(true)
})
it("클릭 전에 이미 있던 추가지원과 숨겨진 추가지원은 전환으로 세지 않는다", () => {
  completion('<button data-applymode="ONLINE" data-activity="APPLY_COMPLETE">추가지원</button><button>지원하기</button>')
  const before = new Set<Element>([document.querySelector("button")!])
  expect(hasJobkoreaCompletionTransition(document, before)).toBe(false)
  document.body.insertAdjacentHTML("beforeend", '<div hidden><button>추가지원</button></div>')
  expect(hasJobkoreaCompletionTransition(document, before)).toBe(false)
})
