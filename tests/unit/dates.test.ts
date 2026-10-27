import { it, expect } from "vitest"
import { parseApplicationDate } from "../../src/core/dates"
import { safeJobUrl } from "../../src/core/urls"
import { toCsv } from "../../src/ui/client"
import { record } from "../helpers"

it.each([["2026.10.1", "2026-10-01"], ["2026-10-10 14:00", "2026-10-10"], ["2024년 2월 29일", "2024-02-29"], ["2026/10/10", "2026-10-10"]])("지원 날짜 %s", (raw, expected) => expect(parseApplicationDate(raw)).toBe(expected))
it.each(["2026-02-29", "2026-02-30", "2026-13-01", "10.10", "어제", "", "지원일 미확인"])("불확실한 날짜 %s는 만들지 않는다", raw => expect(parseApplicationDate(raw)).toBeUndefined())
it("공고 URL에서 토큰과 추적 정보를 제외한다", () => expect(safeJobUrl("/zf_user/jobs/relay/view?rec_idx=12&token=secret#auth", "saramin")).toBe("https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=12"))
it.each(["javascript:alert(1)", "https://evil.com/a", "https://www.saramin.co.kr.evil.com", "https://secret@www.saramin.co.kr/a"])("안전하지 않은 링크 %s", url => expect(safeJobUrl(url, "saramin")).toBeUndefined())
it("CSV 수식 실행과 따옴표를 방어한다", () => expect(toCsv([record({ companyName: '=HYPERLINK("evil")' })])).toContain('"\'=HYPERLINK(""evil"")"'))
