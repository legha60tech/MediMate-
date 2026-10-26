import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Schedule from './pages/Schedule.jsx'
import Dispenser from './pages/Dispenser.jsx'
// The 3D page (three.js) is loaded only when opened, to keep the dashboard fast.
const Model3D = lazy(() => import('./pages/Model3D.jsx'))
import Voice from './pages/Voice.jsx'
import Emergency from './pages/Emergency.jsx'
import History from './pages/History.jsx'
import Settings from './pages/Settings.jsx'
import About from './pages/About.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/dispenser" element={<Dispenser />} />
        <Route path="/model" element={<Suspense fallback={<p className="text-sm text-slate-500">Loading 3D model…</p>}><Model3D /></Suspense>} />
        <Route path="/voice" element={<Voice />} />
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
