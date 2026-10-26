import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, MicOff, Send, Volume2, ShieldAlert } from 'lucide-react'
import { useAppState } from '../state/AppState.jsx'
import { api } from '../services/api.js'
import { Badge, Card, PageHeader } from '../components/ui.jsx'
import {
  getRecognitionClass, listVoices, parseCommand, speak, speechSynthesisSupported, stopSpeaking, VOICE_COMMANDS,
} from '../services/voice.js'
import { findNextDose, getMedicine } from '../utils/metrics.js'
import { dayKey, formatTime } from '../utils/time.js'

const RECOGNITION_ERRORS = {
  'not-allowed': 'Microphone permission was denied. Allow it in the browser settings, or type the command below.',
  'service-not-allowed': 'Speech recognition is blocked by the browser. Type the command below.',
  'no-speech': 'No speech was detected. Try again.',
  'audio-capture': 'No microphone was found.',
  network: 'The browser speech service is unavailable. Type the command below.',
  aborted: 'Listening was stopped.',
}

export default function Voice() {
  const { state, refresh } = useAppState()
  const navigate = useNavigate()
  const [listening, setListening] = useState(false)
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(null)
  const [log, setLog] = useState([])
  const [micMessage, setMicMessage] = useState(null)
  const [voices, setVoices] = useState([])
  const [voiceForm, setVoiceForm] = useState({ voiceEnabled: true, speechRate: 1, voiceName: '' })
  const [voiceDirty, setVoiceDirty] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)
  const recognitionSupported = Boolean(getRecognitionClass())

  useEffect(() => {
    const load = () => setVoices(listVoices())
    load()
    if (speechSynthesisSupported) window.speechSynthesis.onvoiceschanged = load
    return () => { if (speechSynthesisSupported) window.speechSynthesis.onvoiceschanged = null }
  }, [])

  useEffect(() => {
    if (!voiceDirty) {
      setVoiceForm({
        voiceEnabled: state.settings.voiceEnabled,
        speechRate: state.settings.speechRate,
        voiceName: state.settings.voiceName,
      })
    }
  }, [state.settings, voiceDirty])

  const say = (text) => {
    setLog((entries) => [{ who: 'assistant', text }, ...entries].slice(0, 12))
    speak(text, { enabled: state.settings.voiceEnabled, rate: state.settings.speechRate, voiceName: state.settings.voiceName })
  }

  const todayKey = dayKey(new Date())
  const todaysDoses = state.doses.filter((d) => dayKey(new Date(d.scheduledAt)) === todayKey)

  const execute = async (action) => {
    if (!action) return
    try {
      if (action.kind === 'taken') {
        await api.confirmDose(action.doseId)
        await refresh()
        say('Thank you. The dose is recorded as taken.')
      } else if (action.kind === 'emergency') {
        await api.createEmergency('voice', action.transcript)
        say('Simulated emergency workflow started. No real call will be placed. Opening the emergency page.')
        navigate('/emergency')
      }
    } catch (err) {
      say(`I could not complete that. ${err.message}`)
    }
  }

  const handleCommand = (raw) => {
    const text = raw.trim()
    if (!text) return
    setLog((entries) => [{ who: 'user', text }, ...entries].slice(0, 12))

    if (pending) {
      const lower = text.toLowerCase()
      const current = pending
      setPending(null)
      if (/\b(yes|confirm|confirmed)\b/.test(lower)) return execute(current)
      if (/\b(no|cancel)\b/.test(lower)) return say('Cancelled. Nothing was changed.')
    }

    const { intent } = parseCommand(text)
    const now = new Date()
    switch (intent) {
      case 'next_medicine': {
        const next = findNextDose(state.doses, now)
        if (!next) return say('There are no upcoming doses in the schedule.')
        const med = getMedicine(state.medicines, next.medicineId)
        return say(`Your next medicine is ${med?.name ?? 'unknown'} at ${formatTime(new Date(next.scheduledAt))}, in compartment ${med?.compartment ?? 'unknown'}.`)
      }
      case 'todays_schedule': {
        if (todaysDoses.length === 0) return say('There are no doses scheduled for today.')
        const parts = todaysDoses.map((d) => `${formatTime(new Date(d.scheduledAt))} ${getMedicine(state.medicines, d.medicineId)?.name ?? 'medicine'}`)
        return say(`Today you have ${todaysDoses.length} scheduled doses: ${parts.join(', ')}.`)
      }
      case 'medicine_taken': {
        const waiting = state.doses.find((d) => d.status === 'awaiting_confirmation' || d.status === 'dispensing_completed')
        if (!waiting) return say('No dispensed dose is waiting for confirmation. Dispense a dose from the live dispenser first.')
        const med = getMedicine(state.medicines, waiting.medicineId)
        setPending({ kind: 'taken', doseId: waiting.id })
        return say(`Please confirm: did you take ${med?.name ?? 'this medicine'}? Say confirm or press the confirm button.`)
      }
      case 'emergency_call':
        setPending({ kind: 'emergency', transcript: text })
        return say('Emergency call requested. This is a simulation and no real call will be placed. Say confirm to start the simulated workflow, or say cancel.')
      case 'stop_voice':
        stopSpeaking()
        return setLog((entries) => [{ who: 'system', text: 'Speech stopped.' }, ...entries].slice(0, 12))
      case 'empty':
        return
      default:
        return say('Sorry, I did not understand. Try: what is my next medicine, medicine taken, show today\'s schedule, emergency call, or stop voice.')
    }
  }

  const startListening = () => {
    const Recognition = getRecognitionClass()
    if (!Recognition) {
      setMicMessage({ type: 'error', text: 'Speech recognition is not supported in this browser. Use Chrome or Edge, or type the command below.' })
      return
    }
    setMicMessage(null)
    const recognition = new Recognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => setListening(true)
    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim() ?? ''
      if (!text) setMicMessage({ type: 'info', text: 'I heard nothing. Please try again.' })
      else handleCommand(text)
    }
    recognition.onerror = (event) => setMicMessage({ type: 'error', text: RECOGNITION_ERRORS[event.error] ?? `Recognition error: ${event.error}` })
    recognition.onend = () => setListening(false)
    try {
      recognition.start()
    } catch {
      setListening(false)
      setMicMessage({ type: 'error', text: 'Could not start the microphone. Try again or type the command below.' })
    }
  }

  const onTypedSubmit = (event) => {
    event.preventDefault()
    handleCommand(typed)
    setTyped('')
  }

  const saveVoice = async () => {
    setSaveMessage(null)
    try {
      await api.saveSettings({ ...state.settings, ...voiceForm, speechRate: Number(voiceForm.speechRate) })
      setVoiceDirty(false)
      setSaveMessage({ type: 'info', text: 'Voice settings saved.' })
      await refresh()
    } catch (err) {
      setSaveMessage({ type: 'error', text: err.message })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Voice Assistant" subtitle="Browser speech output and recognition. Sensitive actions always ask for confirmation." />

      {pending && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            {pending.kind === 'taken' ? 'Confirm: medicine taken?' : 'Confirm the simulated emergency workflow?'}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={() => { const p = pending; setPending(null); execute(p) }}>Confirm</button>
            <button type="button" className="btn-secondary" onClick={() => { setPending(null); say('Cancelled. Nothing was changed.') }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="flex flex-col items-center gap-4 text-center xl:col-span-1">
          <button
            type="button"
            onClick={startListening}
            disabled={!recognitionSupported || listening}
            aria-label={listening ? 'Listening' : 'Start voice command'}
            className={`flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition ${listening ? 'animate-pulse bg-rose-600' : 'bg-brand-600 hover:bg-brand-700'} disabled:bg-slate-400`}
          >
            {listening ? <MicOff className="h-10 w-10" /> : <Mic className="h-10 w-10" />}
          </button>
          <p className="text-sm text-slate-600">{listening ? 'Listening… speak now' : recognitionSupported ? 'Press the microphone and speak a command' : 'Voice input is not available in this browser'}</p>
          {micMessage && <p className={`text-sm ${micMessage.type === 'error' ? 'text-rose-700' : 'text-slate-600'}`}>{micMessage.text}</p>}

          <form onSubmit={onTypedSubmit} className="w-full">
            <label htmlFor="typed-command" className="sr-only">Type a command</label>
            <div className="flex gap-2">
              <input id="typed-command" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type a command"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
              <button type="submit" className="btn-primary px-3" aria-label="Send command"><Send className="h-4 w-4" /></button>
            </div>
          </form>
        </Card>

        <Card className="xl:col-span-2">
          <h2 className="font-semibold text-slate-900">Conversation</h2>
          <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto" aria-live="polite">
            {log.length === 0 && <li className="text-sm text-slate-500">Try saying “What is my next medicine?”</li>}
            {log.map((entry, i) => (
              <li key={i} className={`flex ${entry.who === 'user' ? 'justify-end' : 'justify-start'}`}>
                <span className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${entry.who === 'user' ? 'bg-brand-600 text-white' : entry.who === 'system' ? 'bg-slate-100 text-slate-600' : 'bg-slate-100 text-slate-800'}`}>
                  {entry.text}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-800">Supported commands</h3>
            <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {VOICE_COMMANDS.map((c) => (
                <li key={c.phrase} className="rounded-xl bg-slate-50 p-3">
                  <p className="font-medium text-slate-900">“{c.phrase}”</p>
                  <p className="text-xs text-slate-500">{c.purpose}</p>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Voice settings</h2>
          {!speechSynthesisSupported && <Badge tone="rose">Speech output not supported</Badge>}
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4" checked={voiceForm.voiceEnabled}
              onChange={(e) => { setVoiceDirty(true); setVoiceForm({ ...voiceForm, voiceEnabled: e.target.checked }) }} />
            Spoken reminders and replies enabled
          </label>
          <label className="text-sm text-slate-700">
            Speech rate: {Number(voiceForm.speechRate).toFixed(1)}×
            <input type="range" min="0.5" max="2" step="0.1" className="mt-2 w-full" value={voiceForm.speechRate}
              onChange={(e) => { setVoiceDirty(true); setVoiceForm({ ...voiceForm, speechRate: e.target.value }) }} />
          </label>
          <label className="text-sm text-slate-700 md:col-span-2">
            Voice {voices.length === 0 && <span className="text-xs text-slate-500">(no voices reported by this browser)</span>}
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value={voiceForm.voiceName}
              onChange={(e) => { setVoiceDirty(true); setVoiceForm({ ...voiceForm, voiceName: e.target.value }) }}>
              <option value="">Browser default</option>
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={saveVoice} disabled={!voiceDirty || state.source !== 'live'}>Save voice settings</button>
          <button type="button" className="btn-secondary" onClick={() => speak(
            'Hello. This is a voice test from MediMate IoT. It is time for your scheduled medicine.',
            { enabled: true, rate: Number(voiceForm.speechRate), voiceName: voiceForm.voiceName })}>
            <Volume2 className="h-4 w-4" aria-hidden="true" /> Test voice
          </button>
          <button type="button" className="btn-secondary" onClick={() => stopSpeaking()}>Stop voice</button>
        </div>
        {saveMessage && <p className={`mt-3 text-sm ${saveMessage.type === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>{saveMessage.text}</p>}
      </Card>
    </div>
  )
}
