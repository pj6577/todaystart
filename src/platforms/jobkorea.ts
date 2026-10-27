import { DomPlatformAdapter } from "./adapter"
import type { SelectorProfile } from "./profile"

export class JobkoreaAdapter extends DomPlatformAdapter {
  constructor(profile?: SelectorProfile) { super("jobkorea", profile) }
}
