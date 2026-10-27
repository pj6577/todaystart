import { readFileSync } from "node:fs"
import path from "node:path"
import type { Platform, ApplicationRecord } from "../src/core/model"
import { applicationIdentity } from "../src/core/identity"
import { normalizeCompanyName } from "../src/core/company"
import { validateProfile } from "../src/platforms/profile"

export function fixture(name: string) { return readFileSync(path.resolve("tests/fixtures", name), "utf8") }
export function fixtureProfile(platform: Platform) { return validateProfile(JSON.parse(fixture(`profiles/${platform}.json`))) }
export function record(changes: Partial<ApplicationRecord> = {}): ApplicationRecord {
  const base = { platform: "saramin" as const, companyName: "헌터협회", normalizedCompanyName: normalizeCompanyName("헌터협회"), jobTitle: "개발자", sourceJobId: "100", appliedAt: "2026-10-10", status: "applied" as const, evidence: "history_page" as const, collectedAt: "2026-10-10T12:00:00.000Z", lastSeenAt: "2026-10-10T12:00:00.000Z", lastSyncedAt: "2026-10-10T12:00:00.000Z", ...changes }
  return { id: applicationIdentity(base), ...base }
}
