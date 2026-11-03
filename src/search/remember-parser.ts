import { z } from "zod"
import { searchLimits, type SearchJob, type SearchPage } from "./model"

const label = z.string().trim().min(1).max(300)
const year = z.number().int().nonnegative().max(100).nullable().optional()
const rowSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), title: label, status: z.literal("published"),
  organization: z.object({ name: label }), min_experience: year, max_experience: year,
  normalized_address: z.object({ level1: z.string().nullable().optional(), level2: z.string().nullable().optional() }).nullable().optional(),
  addresses: z.array(z.object({ address_level1: z.string().nullable().optional(), address_level2: z.string().nullable().optional() })).optional(),
  ends_at: z.string().nullable().optional(), explicit_due: z.boolean().optional()
})
const responseSchema = z.object({ data: z.array(z.unknown()), meta: z.object({
  page: z.number().int().positive(), total_pages: z.number().int().nonnegative()
}) })
const clean = (value?: string | null) => value?.replace(/\s+/g, " ").trim().slice(0, 300) || undefined

export function parseRememberSearch(raw: unknown, page: number): SearchPage {
  const parsed = responseSchema.safeParse(raw)
  if (!parsed.success || parsed.data.meta.page !== page) return { jobs: [], hasNext: false, status: "unreadable", message: "리멤버 검색 응답 형식을 읽지 못했습니다." }
  const jobs: SearchJob[] = [], seen = new Set<number>()
  for (const value of parsed.data.data.slice(0, searchLimits.rows)) {
    const parsedRow = rowSchema.safeParse(value)
    if (!parsedRow.success) continue
    const row = parsedRow.data
    if (seen.has(row.id)) continue
    seen.add(row.id)
    const from = row.min_experience, to = row.max_experience
    const address = row.normalized_address
    const location = address ? [address.level1, address.level2].map(clean).filter(Boolean).join(" ") :
      [...new Set((row.addresses ?? []).map(address => [address.address_level1, address.address_level2].map(clean).filter(Boolean).join(" ")).filter(Boolean))].join(" · ")
    const due = row.explicit_due && row.ends_at && /^\d{4}-\d{2}-\d{2}T/.test(row.ends_at) && Number.isFinite(Date.parse(row.ends_at)) ?
      new Date(row.ends_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) : undefined
    jobs.push({ id: `remember:${row.id}`, platform: "remember", companyName: clean(row.organization.name)!, jobTitle: clean(row.title)!,
      jobUrl: `https://career.rememberapp.co.kr/job/posting/${row.id}`, location: location || undefined,
      career: from == null && to == null ? "경력무관" : from === 0 && to === 0 ? "신입" : from != null && to != null ?
        from === 0 ? `신입~${to}년` : `${from}~${to}년` : from != null ? from === 0 ? "신입 이상" : `${from}년 이상` : `${to}년 이하`,
      deadline: due || (row.explicit_due ? undefined : "상시채용") })
  }
  const empty = parsed.data.data.length === 0
  return { jobs, hasNext: jobs.length > 0 && page < parsed.data.meta.total_pages && page < searchLimits.pages,
    status: empty ? "empty" : jobs.length ? "ok" : "unreadable", message: empty ? "검색 결과가 없습니다." : !jobs.length ? "리멤버 공고 항목을 읽지 못했습니다." : undefined }
}
