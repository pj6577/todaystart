import Fuse from "fuse.js"
import type { ApplicationRecord, CompanyMatch, Confidence, JobPosting } from "./model"

export function strictCompanyName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR")
}

export function normalizeCompanyName(value: string): string {
  // Legal markers only at the edges. Keep meaningful words such as 홀딩스, 지주, 본사.
  return strictCompanyName(value)
    .replace(/^(?:주식회사|\(\s*주\s*\))\s*/, "")
    .replace(/\s*(?:주식회사|\(\s*주\s*\))$/, "")
    .replace(/[\s·.,_-]/g, "")
}

export function compareCompanies(a: Pick<JobPosting, "companyName" | "companyIdentifier">, b: Pick<JobPosting, "companyName" | "companyIdentifier">): Confidence {
  if (a.companyIdentifier && b.companyIdentifier) return a.companyIdentifier === b.companyIdentifier ? "exact" : "none"
  if (!normalizeCompanyName(a.companyName) || !normalizeCompanyName(b.companyName)) return "none"
  if (strictCompanyName(a.companyName) === strictCompanyName(b.companyName)) return "exact"
  if (normalizeCompanyName(a.companyName) === normalizeCompanyName(b.companyName)) return "probable"
  return "none"
}

export class CompanyMatcher {
  private fuzzy?: Fuse<ApplicationRecord>
  private readonly records: ApplicationRecord[]
  private readonly byName = new Map<string, number[]>()
  private readonly byIdentifier = new Map<string, number[]>()
  constructor(records: ApplicationRecord[], includeCancelled = false) {
    this.records = records.filter(r => r.status === "applied" || (includeCancelled && r.status === "cancelled"))
    this.records.forEach((record, index) => {
      const name = normalizeCompanyName(record.companyName)
      if (name) this.add(this.byName, name, index)
      if (record.companyIdentifier) this.add(this.byIdentifier, JSON.stringify([record.platform, record.companyIdentifier]), index)
    })
  }
  private add(index: Map<string, number[]>, key: string, value: number) {
    const bucket = index.get(key)
    if (bucket) bucket.push(value)
    else index.set(key, [value])
  }
  find(posting: JobPosting, similar = false): CompanyMatch[] {
    const results: CompanyMatch[] = []
    const name = normalizeCompanyName(posting.companyName)
    // IDs only compare within a site's namespace. Union both indexes so an
    // identifier can still match a renamed company, preserving input order.
    const candidates = new Set(this.byName.get(name))
    if (posting.companyIdentifier) for (const index of this.byIdentifier.get(JSON.stringify([posting.platform, posting.companyIdentifier])) || []) candidates.add(index)
    for (const index of [...candidates].sort((a, b) => a - b)) {
      const record = this.records[index]!
      // These identifiers belong to each site's own namespace. A Saramin csn
      // and a Jobkorea memsysno cannot establish equality or inequality.
      const confidence = compareCompanies(posting, record.platform === posting.platform ? record : { ...record, companyIdentifier: undefined })
      if (confidence !== "none") results.push({ record, confidence, reason: confidence === "exact" ? "기업 식별자 또는 엄격한 이름 일치 · 동명이사 가능성 확인 필요" : "법인 표기·띄어쓰기를 정리한 이름 일치 · 동일 기업인지 확인 필요" })
    }
    if (similar && name.length >= 3) {
      this.fuzzy ||= new Fuse(this.records, { keys: ["normalizedCompanyName"], threshold: 0.25, ignoreLocation: true, minMatchCharLength: 3 })
      const existing = new Set(results.map(r => r.record.id))
      for (const { item } of this.fuzzy.search(name)) {
        if (!existing.has(item.id) && !(item.platform === posting.platform && posting.companyIdentifier && item.companyIdentifier && posting.companyIdentifier !== item.companyIdentifier)) {
          results.push({ record: item, confidence: "possible", reason: "이름만 비슷합니다. 같은 기업으로 확정할 수 없습니다." })
        }
      }
    }
    return results
  }
}
