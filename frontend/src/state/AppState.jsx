// Application state. Loads from the FastAPI backend every 2 seconds.
// If the backend is not running, the UI shows read-only demo data and says so clearly.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import { DEMO_MEDICINES, DEMO_SETTINGS, buildDemoDoses, buildDemoEvents, buildDemoDevice } from './seed.js'

function demoSnapshot() {
  const now = new Date()
  const doses = buildDemoDoses(DEMO_MEDICINES, now)
  return {
    medicines: DEMO_MEDICINES,
    doses,
    events: buildDemoEvents(doses, DEMO_MEDICINES, now),
    device: buildDemoDevice(now),
    settings: DEMO_SETTINGS,
  }
}

const AppStateContext = createContext(null)

export function AppStateProvider({ children }) {
  const [snapshot, setSnapshot] = useState(demoSnapshot)
  // 'connecting' | 'live' | 'demo' (backend never reached) | 'offline' (lost after being live)
  const [source, setSource] = useState('connecting')
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const data = await api.bootstrap()
      setSnapshot(data)
      setSource('live')
      setError(null)
    } catch (err) {
      setError(err.message)
      setSource((previous) => (previous === 'live' ? 'offline' : 'demo'))
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 2000)
    return () => clearInterval(id)
  }, [refresh])

  const value = useMemo(
    () => ({ state: { ...snapshot, source, error }, refresh }),
    [snapshot, source, error, refresh],
  )
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>')
  return ctx
}
