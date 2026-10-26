import { useEffect, useState } from 'react'

/** Returns the current Date, refreshed every `intervalMs` (used for clocks and countdowns). */
export default function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
