import { expect, it } from "vitest"
import { CompanyMatcher, compareCompanies } from "../../src/core/company"
import { PostingMatches } from "../../src/core/posting-matches"
import { linkedRecord, linkedRecordMap, noteCountsByRecord } from "../../src/core/planner-lookups"
import { PostingView } from "../../src/platforms/posting-view"
import type { JobPosting } from "../../src/core/model"
import { record } from "../helpers"

it("indexed company matching preserves linear matching order, IDs, legal markers and status choices", () => {
  const names = ["헌터협회", "(주)헌터협회", "헌터 협회", "헌터협회홀딩스", "다른기업", "(주)"]
  const records = names.flatMap((companyName, i) => (["saramin", "jobkorea", "manual"] as const).flatMap(platform => [undefined, "biz:1", "biz:2"].map((companyIdentifier, j) => record({ companyName, platform, companyIdentifier, status: j === 2 ? "cancelled" : "applied", sourceApplicationId: `${i}-${platform}-${j}` }))))
  for (const includeCancelled of [false, true]) {
    const matcher = new CompanyMatcher(records, includeCancelled)
    for (const companyName of [...names, "새 기업명"]) for (const platform of ["saramin", "jobkorea", "wanted"] as const) for (const companyIdentifier of [undefined, "biz:1", "biz:3"]) {
      const posting = { companyName, platform, companyIdentifier, jobTitle: "다른 직무" }
      const expected = records.filter(r => r.status === "applied" || includeCancelled && r.status === "cancelled").flatMap(r => {
        const confidence = compareCompanies(posting, r.platform === platform ? r : { ...r, companyIdentifier: undefined })
        return confidence === "none" ? [] : [{ id: r.id, confidence }]
      })
      expect(matcher.find(posting).map(m => ({ id: m.record.id, confidence: m.confidence }))).toEqual(expected)
    }
  }
})

it("reuses company matches across jobs but invalidates on records, cancellation and similar-name settings", () => {
  const cache = new PostingMatches(), records = [record(), record({ companyName: "헌터협희", normalizedCompanyName: "헌터협희", sourceApplicationId: "similar" }), record({ status: "cancelled", sourceApplicationId: "cancelled" })]
  const posting: JobPosting = { platform: "jobkorea", companyName: "헌터협회", jobTitle: "개발자" }
  cache.update(records, false)
  const first = cache.find(posting, false)
  expect(cache.find({ ...posting, jobTitle: "다른 직무" }, false)).toBe(first)
  expect(cache.find(posting, true).some(m => m.confidence === "possible")).toBe(true)
  cache.update(records, true)
  expect(cache.find(posting, false)).toHaveLength(2)
  cache.update([], true)
  expect(cache.find(posting, false)).toEqual([])
})

it("resolves planner links and counts each note once for all of its linked records", () => {
  const a = record(), b = record({ sourceApplicationId: "second" })
  const links = [{ id: "a", recordId: a.id, aliases: [] }, { id: "b", recordId: b.id, aliases: [] }, { id: "deleted", recordId: "missing", aliases: [] }]
  expect(linkedRecord("b", [a, b], links)).toBe(b)
  expect(linkedRecord(undefined, [a, b], links)).toBeUndefined()
  expect(linkedRecord("deleted", [a, b], links)).toBeUndefined()
  expect([...linkedRecordMap([a, b], links).values()]).toEqual([a, b])
  const note = { id: "note", revision: 1, title: "메모", body: "@기업", checklist: [], pinned: false, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", linkId: "a", mentions: [{ linkId: "a", label: "기업", start: 0, end: 3 }, { linkId: "b", label: "기업", start: 0, end: 3 }] }
  expect(noteCountsByRecord(links, [note])).toEqual({ [a.id]: 1, [b.id]: 1, missing: 0 })
})

it("skips unchanged posting views but refreshes edited, cloned, removed or differently themed cards", () => {
  const view = new PostingView(), records = [record()]
  const posting: JobPosting = { platform: "saramin", companyName: "헌터협회", jobTitle: "개발자", element: document.createElement("div") }
  expect(view.changed([posting], records, "light")).toBe(true)
  expect(view.changed([{ ...posting }], records, "light")).toBe(false)
  expect(view.changed([{ ...posting, element: posting.element!.cloneNode(true) as Element }], records, "light")).toBe(true)
  expect(view.changed([posting], records, "dark")).toBe(true)
  expect(view.changed([{ ...posting, companyName: "다른기업" }], records, "dark")).toBe(true)
  expect(view.changed([posting], [...records], "dark")).toBe(true)
  expect(view.changed([], records, "dark")).toBe(true)
  view.clear()
  expect(view.changed([posting], records, "dark")).toBe(true)
})
