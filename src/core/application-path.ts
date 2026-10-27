import { platformLabel, type ApplicationRecord, type ApplicationSource } from "./model"

// Manually recorded sites remain separate from automatic collection integrations.
export type ApplicationPath = ApplicationSource | `manual:${string}`
export function applicationPath(record: Pick<ApplicationRecord, "platform" | "sourceLabel">): ApplicationPath {
  return record.platform === "manual" && record.sourceLabel?.trim() ? `manual:${record.sourceLabel.trim()}` : record.platform
}
export function applicationPathLabel(path: ApplicationPath) {
  return path.startsWith("manual:") ? path.slice(7) : platformLabel[path as ApplicationSource]
}
