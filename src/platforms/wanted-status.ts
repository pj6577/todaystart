import type { ApplicationStatus } from "../core/model"

// Interpret only the application's status field, never titles or recommendations.
// Keep the original label separately for display; receipt does not prove reading.
export function wantedApplicationStatus(label: string): ApplicationStatus {
  const normalized = label.normalize("NFKC").replace(/\s+/g, "")
  if (/^(?:지원|접수)?취소(?:완료)?$/.test(normalized)) return "cancelled"
  if (/^(?:접수|접수완료|지원완료|서류통과|최종합격|불합격)$/.test(normalized)) return "applied"
  return "unknown"
}
