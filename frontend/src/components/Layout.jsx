import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, CalendarClock, Pill, Box, Mic, Siren, History, SlidersHorizontal, Info, Menu,
} from 'lucide-react'
import { useAppState } from '../state/AppState.jsx'
import DoseAlert from './DoseAlert.jsx'

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/schedule', label: 'Medicine Schedule', icon: CalendarClock },
  { to: '/dispenser', label: 'Live Dispenser', icon: Pill },
  { to: '/model', label: 'Interactive 3D Model', icon: Box },
  { to: '/voice', label: 'Voice Assistant', icon: Mic },
  { to: '/emergency', label: 'Emergency Caretaker', icon: Siren },
  { to: '/history', label: 'Dose History', icon: History },
  { to: '/settings', label: 'Device Settings', icon: SlidersHorizontal },
  { to: '/about', label: 'About the Project', icon: Info },
]

function SidebarContent() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="rounded-xl bg-brand-600 p-2 text-white">
          <Pill className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight text-slate-900">MediMate IoT</p>
          <p className="text-xs text-slate-500">Smart dispenser prototype</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <item.icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="m-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
        Academic prototype. Not a certified medical device. Do not use it to manage real medication.
      </div>
    </div>
  )
}

function StatusBanner({ source, device }) {
  let text
  let classes
  if (source === 'live' && device.mode === 'simulation') {
    text = 'SIMULATION MODE · Backend connected · No hardware connected · Events are simulated'
    classes = 'bg-amber-100 text-amber-800'
  } else if (source === 'live') {
    text = device.connected ? 'LIVE HARDWARE CONNECTED' : 'LIVE MODE · Hardware not connected'
    classes = device.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
  } else if (source === 'connecting') {
    text = 'Connecting to the backend…'
    classes = 'bg-slate-100 text-slate-700'
  } else if (source === 'offline') {
    text = 'BACKEND CONNECTION LOST · Showing last known data · Actions are disabled'
    classes = 'bg-rose-100 text-rose-800'
  } else {
    text = 'BACKEND NOT RUNNING · Showing read-only demo data · Start the backend to use the app'
    classes = 'bg-rose-100 text-rose-800'
  }
  return (
    <div role="status" className={`flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${classes}`}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-current animate-pulse" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </div>
  )
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { state } = useAppState()

  useEffect(() => setMobileOpen(false), [location.pathname])

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="relative z-50 h-full w-72 max-w-[85%] bg-white shadow-xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <StatusBanner source={state.source} device={state.device} />
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8">
          <DoseAlert />
          <Outlet />
        </main>

        <footer className="px-4 pb-24 pt-2 text-center text-xs text-slate-400 lg:px-8">
          MediMate IoT prototype · Demonstration data is labelled · Not for real medication management
        </footer>
      </div>

      <Link
        to="/emergency"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-rose-700"
      >
        <Siren className="h-5 w-5" aria-hidden="true" />
        Emergency
      </Link>
    </div>
  )
}
