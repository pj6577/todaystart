import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { WantedSubmissionObserver } from "../../src/platforms/wanted-submission-observer"

const selector = 'button[data-attribute-id="apply__done__net"][data-position-id]'
const button = '<button data-attribute-id="apply__done__net" data-position-id="392849" data-company-name="가상 기업" data-position-name="개발자">제출하기</button>'
let observer: WantedSubmissionObserver, inspect: ReturnType<typeof vi.fn>, url: string
let scans: ReturnType<typeof vi.spyOn>, hidden = false
beforeEach(() => {
  vi.useFakeTimers()
  hidden = false
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden)
  document.body.innerHTML = '<main><div id="unrelated"></div><div id="modal"></div></main>'
  url = "https://www.wanted.co.kr/wd/392849"
  scans = vi.spyOn(document, "querySelectorAll")
  inspect = vi.fn()
  observer = new WantedSubmissionObserver(selector, inspect, () => url)
})
afterEach(() => { observer.dispose(); vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML = "" })
const scanned = () => scans.mock.calls.filter(call => call[0] === selector).length

it.each(["https://www.wanted.co.kr/", "https://www.wanted.co.kr/wdlist/518", "https://www.wanted.co.kr/status/applications/applied"])("%s에서는 제출 관찰·문서 재검색을 하지 않는다", async page => {
  url = page
  observer.start(); observer.setEnabled(true)
  document.querySelector("#modal")!.innerHTML = button
  await vi.advanceTimersByTimeAsync(30000)
  expect(inspect).not.toHaveBeenCalled()
  expect(scanned()).toBe(0)
})
it("상세 화면에서도 URL 변화 없는 30초 동안 DOM을 다시 검색하지 않는다", async () => {
  observer.start(); observer.setEnabled(true)
  const initial = inspect.mock.calls.length
  await vi.advanceTimersByTimeAsync(30000)
  expect(inspect).toHaveBeenCalledTimes(initial)
  expect(scanned()).toBe(1)
})
it("관련 없는 스타일·DOM 변경 100회를 무시하고 새 제출 버튼만 모아서 처리한다", async () => {
  observer.start(); observer.setEnabled(true)
  const initial = inspect.mock.calls.length
  const unrelated = document.querySelector("#unrelated")!
  for (let index = 0; index < 100; index++) {
    unrelated.setAttribute("class", `animation-${index}`)
    unrelated.textContent = `${index}`
    await vi.advanceTimersByTimeAsync(10)
  }
  expect(inspect).toHaveBeenCalledTimes(initial)
  document.querySelector("#modal")!.innerHTML = button
  const control = document.querySelector<HTMLButtonElement>(selector)!
  control.disabled = true; control.disabled = false
  await vi.advanceTimersByTimeAsync(150)
  expect(inspect).toHaveBeenCalledTimes(initial + 1)
  expect(observer.buttons()).toEqual([control])
  expect(scanned()).toBe(1)
})
it("숨겨진 지원창의 표시·버튼 데이터 변경과 버튼 교체를 감지한다", async () => {
  const modal = document.querySelector<HTMLElement>("#modal")!
  modal.hidden = true; modal.innerHTML = button
  observer.start(); observer.setEnabled(true)
  const initial = inspect.mock.calls.length
  modal.hidden = false
  document.querySelector(selector)!.setAttribute("data-company-name", "변경 기업")
  await vi.advanceTimersByTimeAsync(150)
  expect(inspect).toHaveBeenCalledTimes(initial + 1)
  const old = observer.buttons()[0]
  modal.innerHTML = button
  await vi.advanceTimersByTimeAsync(150)
  expect(observer.buttons()).toHaveLength(1)
  expect(observer.buttons()[0]).not.toBe(old)
  expect(scanned()).toBe(1)
})
it("SPA 완료 경로는 URL 변경 시 한 번 확인하고 다른 페이지에서는 관찰을 해제한다", async () => {
  observer.start(); observer.setEnabled(true)
  url += "/applied"
  await vi.advanceTimersByTimeAsync(1000)
  expect(inspect).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(5000)
  expect(inspect).toHaveBeenCalledTimes(2)
  expect(scanned()).toBe(1)
  url = "https://www.wanted.co.kr/wdlist/518"
  await vi.advanceTimersByTimeAsync(1000)
  document.querySelector("#modal")!.innerHTML = button
  await vi.advanceTimersByTimeAsync(150)
  expect(inspect).toHaveBeenCalledTimes(2)
})
it("정책 비활성화·숨긴 탭에서 멈추고 다시 켰을 때 현재 버튼을 재발견한다", async () => {
  observer.start(); observer.setEnabled(true)
  observer.setEnabled(false)
  document.querySelector("#modal")!.innerHTML = button
  await vi.advanceTimersByTimeAsync(200)
  expect(inspect).toHaveBeenCalledTimes(1)
  observer.setEnabled(true)
  expect(observer.buttons()).toHaveLength(1)
  hidden = true; document.dispatchEvent(new Event("visibilitychange"))
  document.querySelector(selector)!.setAttribute("class", "hidden-animation")
  await vi.advanceTimersByTimeAsync(5000)
  expect(inspect).toHaveBeenCalledTimes(2)
  hidden = false; document.dispatchEvent(new Event("visibilitychange"))
  expect(inspect).toHaveBeenCalledTimes(3)
  const scanCount = scanned()
  observer.setEnabled(true)
  expect(scanned()).toBe(scanCount)
})
it("완료 재시도 예약은 한 번만 유지하고 종료 시 모든 타이머를 정리한다", async () => {
  observer.start(); observer.setEnabled(true)
  observer.schedule(500); observer.schedule(500)
  await vi.advanceTimersByTimeAsync(500)
  expect(inspect).toHaveBeenCalledTimes(2)
  observer.schedule(500); observer.dispose(); observer.dispose()
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(1000)
  expect(inspect).toHaveBeenCalledTimes(2)
})
