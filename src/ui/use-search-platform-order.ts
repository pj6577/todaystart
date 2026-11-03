import { useEffect, useRef, useState } from "react"
import type { SearchPlatform } from "../search/model"
import { moveSearchPlatform, readSearchPlatformOrder, saveSearchPlatformOrder, searchPlatformOrderKey } from "../search/platform-order"

export function useSearchPlatformOrder() {
  const [order, setOrder] = useState(readSearchPlatformOrder)
  const current = useRef(order)
  const [error, setError] = useState("")
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key !== null && event.key !== searchPlatformOrderKey) return
      current.current = readSearchPlatformOrder(); setOrder(current.current); setError("")
    }
    window.addEventListener("storage", refresh)
    return () => window.removeEventListener("storage", refresh)
  }, [])
  function move(from: SearchPlatform, to: SearchPlatform) {
    if (from === to) return
    const next = moveSearchPlatform(current.current, from, to)
    current.current = next; setOrder(next)
    setError(saveSearchPlatformOrder(next) ? "" : "순서는 변경했지만 저장하지 못했어요. 다음에 열면 이전 순서로 표시될 수 있어요.")
  }
  return { order, move, error }
}
