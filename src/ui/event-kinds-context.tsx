import React, { createContext, useContext, type ReactNode } from "react"
import { configuredEventKinds, eventKindLabel, type EventKindConfig } from "../core/event-kinds"

const EventKindsContext = createContext<EventKindConfig | undefined>(undefined)
export function EventKindsProvider({ config, children }: { config?: EventKindConfig; children: ReactNode }) { return <EventKindsContext.Provider value={config}>{children}</EventKindsContext.Provider> }
export function useEventKinds() {
  const config = useContext(EventKindsContext)
  return { kinds: configuredEventKinds(config), kindLabel: (id: string) => eventKindLabel(id, config) }
}
