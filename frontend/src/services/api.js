// Thin wrapper around fetch for the FastAPI backend. All calls go through /api (Vite proxies it in dev).
const BASE = import.meta.env.VITE_API_BASE_URL || '/api'

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.status = status
  }
}

function formatDetail(detail) {
  if (!detail) return null
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => (item.field ? `${item.field}: ${item.message}` : item.message)).join('; ')
  }
  return JSON.stringify(detail)
}

async function request(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the MediMate backend. Start it as described in README.md (port 8000).', 0)
  }
  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  if (!response.ok) {
    throw new ApiError(formatDetail(data?.detail) || `Request failed with status ${response.status}`, response.status)
  }
  return data
}

export const api = {
  bootstrap: () => request('/bootstrap'),
  health: () => request('/health'),
  createMedicine: (payload) => request('/medicines', { method: 'POST', body: payload }),
  updateMedicine: (id, payload) => request(`/medicines/${id}`, { method: 'PUT', body: payload }),
  deleteMedicine: (id) => request(`/medicines/${id}`, { method: 'DELETE' }),
  dispense: (doseId) => request('/dispenser/dispense', { method: 'POST', body: { doseId } }),
  stopDispense: (commandId) => request(`/dispenser/commands/${commandId}/stop`, { method: 'POST' }),
  confirmDose: (doseId) => request(`/doses/${doseId}/confirm`, { method: 'POST' }),
  configureSimulation: (payload) => request('/device/simulation', { method: 'POST', body: payload }),
  testConnection: () => request('/device/test-connection', { method: 'POST' }),
  advanceToNextDose: () => request('/demo/advance-to-next-dose', { method: 'POST' }),
  resetClock: () => request('/demo/reset-clock', { method: 'POST' }),
  createEmergency: (source, transcript = '') => request('/emergency/intent', { method: 'POST', body: { source, transcript } }),
  confirmEmergency: (id) => request(`/emergency/${id}/confirm`, { method: 'POST' }),
  cancelEmergency: (id) => request(`/emergency/${id}/cancel`, { method: 'POST' }),
  emergencyEvents: () => request('/emergency/events'),
  saveSettings: (payload) => request('/settings', { method: 'PUT', body: payload }),
}
