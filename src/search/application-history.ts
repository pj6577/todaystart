import { normalizeCompanyName } from "../core/company"
import { compareApplicationRecords } from "../core/record-order"
import type { ApplicationRecord } from "../core/model"

// Search-only key: do not change persisted identities or deduplication keys.
// An explicit Korean/English pair can share its Korean name with another site.
// Same-language qualifiers, locations and organisational units stay meaningful.
export function searchCompanyNameKey(value: string): string {
  const name = normalizeCompanyName(value)
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

// Build once per record snapshot; search cards never send local history to a site.
export function applicationHistoryIndex(records: ApplicationRecord[]) {
  const index = new Map<string, ApplicationRecord[]>()
  for (const record of records) {
    if (record.status !== "applied") continue
    const name = searchCompanyNameKey(record.companyName)
    if (!name) continue
    const bucket = index.get(name)
    if (bucket) bucket.push(record)
    else index.set(name, [record])
  }
  for (const bucket of index.values()) bucket.sort(compareApplicationRecords)
  return index
}
