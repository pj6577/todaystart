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

// User-provided company/service spelling pairs, for display matching only.
// Do not infer corporate identity by removing arbitrary parenthetical text.
const companyServiceDisplayAliases = new Map([
  ["워시스왓(세탁특공대)", "워시스왓"]
])

// Persisted names, application identities and merge keys keep normalizeCompanyName.
// Only display aliases and explicit bilingual pairs share a comparison key.
export function companyMatchNameKey(value: string): string {
  const name = normalizeCompanyName(value)
  const alias = companyServiceDisplayAliases.get(name)
  if (alias) return alias
  const pair = /^([^()]+)\(([^()]+)\)$/.exec(name)
  if (!pair) return name
  const korean = (part: string) => /^[가-힣0-9&'’]+$/.test(part) && (part.match(/[가-힣]/g)?.length || 0) >= 2
  const english = (part: string) => /^[a-z0-9&'’]+$/.test(part) && (part.match(/[a-z]/g)?.length || 0) >= 3
  const first = pair[1]!, second = pair[2]!
  const parts: [string, string] | undefined = korean(first) && english(second) ? [first, second] : english(first) && korean(second) ? [second, first] : undefined
  if (!parts) return name
  const [local, latin] = parts
  if (/(?:본사|본점|지사|지점|지부|센터|사업부|연구소|홀딩스|지주|계열사|자회사|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|한국|미국|일본|중국)$/.test(local) ||
      /(?:branch|office|division|department|subsidiary|holdings?|labs?|research|studio|recruit|frontend|backend|korea|seoul|busan|incheon|daegu|gwangju|daejeon|ulsan|jeju|usa|china|japan)$/.test(latin)) return name
  return local
}

export function compareCompanies(a: Pick<JobPosting, "companyName" | "companyIdentifier">, b: Pick<JobPosting, "companyName" | "companyIdentifier">): Confidence {
  if (a.companyIdentifier && b.companyIdentifier) return a.companyIdentifier === b.companyIdentifier ? "exact" : "none"
  if (!normalizeCompanyName(a.companyName) || !normalizeCompanyName(b.companyName)) return "none"
  if (strictCompanyName(a.companyName) === strictCompanyName(b.companyName)) return "exact"
  if (normalizeCompanyName(a.companyName) === normalizeCompanyName(b.companyName)) return "probable"
  return "none"
}

function warningConfidence(a: Pick<JobPosting, "companyName" | "companyIdentifier">, b: Pick<JobPosting, "companyName" | "companyIdentifier">): Confidence {
  const confidence = compareCompanies(a, b)
  if (confidence !== "none" || (a.companyIdentifier && b.companyIdentifier)) return confidence
  const name = companyMatchNameKey(a.companyName)
  return name && name === companyMatchNameKey(b.companyName) ? "probable" : "none"
}

export class CompanyMatcher {
  private fuzzy?: Fuse<ApplicationRecord>
  private readonly records: ApplicationRecord[]
  private readonly byName = new Map<string, number[]>()
  private readonly byIdentifier = new Map<string, number[]>()
  constructor(records: ApplicationRecord[], includeCancelled = false) {
    this.records = records.filter(r => r.status === "applied" || (includeCancelled && r.status === "cancelled"))
    this.records.forEach((record, index) => {
      const name = companyMatchNameKey(record.companyName)
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
    const name = companyMatchNameKey(posting.companyName)
    // IDs only compare within a site's namespace. Union both indexes so an
    // identifier can still match a renamed company, preserving input order.
    const candidates = new Set(this.byName.get(name))
    if (posting.companyIdentifier) for (const index of this.byIdentifier.get(JSON.stringify([posting.platform, posting.companyIdentifier])) || []) candidates.add(index)
    for (const index of [...candidates].sort((a, b) => a - b)) {
      const record = this.records[index]!
      // These identifiers belong to each site's own namespace. A Saramin csn
      // and a Jobkorea memsysno cannot establish equality or inequality.
      const confidence = warningConfidence(posting, record.platform === posting.platform ? record : { ...record, companyIdentifier: undefined })
      if (confidence !== "none") results.push({ record, confidence, reason: confidence === "exact" ? "기업 식별자 또는 엄격한 이름 일치 · 동명이사 가능성 확인 필요" : "법인 표기·띄어쓰기·한영 병기·등록된 서비스명 별칭의 이름 일치 · 동일 기업인지 확인 필요" })
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
