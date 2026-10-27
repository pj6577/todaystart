import { afterEach, expect, it, vi } from "vitest"
import { isJobkoreaApplyClick } from "../../src/submission/jobkorea-apply"

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks() })
function click(html: string) {
  document.body.innerHTML = html
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
  return isJobkoreaApplyClick(document.querySelector("span,input,button,a,[role=button]")!)
}
it.each([
  '<button class="changed-layout"><span>지원하기</span></button>',
  '<button><span>입사 지원</span></button>',
  '<a href="#"><span>지원하기</span></a>',
  '<input type="submit" value="지원하기">',
  '<div role="button" aria-label="지원하기"></div>'
])("지원창의 최종 지원 컨트롤은 레이아웃 클래스 없이 감지한다: %s", html => expect(click(html)).toBe(true))
it.each([
  '<button>지원 취소</button>', '<button>지원하기 도움말</button>', '<button>추가지원</button>',
  '<div><span>지원하기</span></div>', '<button disabled>지원하기</button>',
  '<fieldset disabled><button>지원하기</button></fieldset>',
  '<div aria-disabled="true"><button>지원하기</button></div>',
  '<div hidden><button>지원하기</button></div>',
  '<div style="display:none"><button>지원하기</button></div>',
  '<div style="visibility:hidden"><button>지원하기</button></div>',
  '<div inert><button>지원하기</button></div>'
])("지원 컨트롤이 아니거나 사용할 수 없으면 제외한다: %s", html => expect(click(html)).toBe(false))

it("화면에 없는 컨트롤은 제외한다", () => {
  document.body.innerHTML = "<button>지원하기</button>"
  expect(isJobkoreaApplyClick(document.querySelector("button")!)).toBe(false)
})
