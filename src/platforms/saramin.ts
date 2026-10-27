import { DomPlatformAdapter } from "./adapter"
import type { SelectorProfile } from "./profile"

export class SaraminAdapter extends DomPlatformAdapter {
  constructor(profile?: SelectorProfile) { super("saramin", profile) }
}
