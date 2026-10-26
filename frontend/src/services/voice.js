// Browser speech helpers plus an offline command parser.
// Speech synthesis and recognition are browser features: when they are missing, the typed fallback still works.
export const speechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

export function getRecognitionClass() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function listVoices() {
  return speechSynthesisSupported ? window.speechSynthesis.getVoices() : []
}

export function speak(text, { enabled = true, rate = 1, voiceName = '' } = {}) {
  if (!enabled || !speechSynthesisSupported) return false
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = rate
  const voice = listVoices().find((v) => v.name === voiceName)
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
  return true
}

export function stopSpeaking() {
  if (speechSynthesisSupported) window.speechSynthesis.cancel()
}

/** Maps a transcript to one of a fixed set of intents. Sensitive intents are confirmed by the UI. */
export function parseCommand(transcript) {
  const text = transcript.toLowerCase().replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return { intent: 'empty', text }
  if (/\b(stop|be quiet|silence|mute)\b/.test(text)) return { intent: 'stop_voice', text }
  if (/\b(emergency|help me|call (my )?caretaker|call for help)\b/.test(text)) return { intent: 'emergency_call', text }
  if (/\bnext\b.*\b(medicine|medication|dose|pill)\b|what is my next/.test(text)) return { intent: 'next_medicine', text }
  if (/\b(taken|took)\b/.test(text)) return { intent: 'medicine_taken', text }
  if (/\b(schedule|today)\b/.test(text)) return { intent: 'todays_schedule', text }
  return { intent: 'unknown', text }
}

export const VOICE_COMMANDS = [
  { phrase: 'What is my next medicine?', purpose: 'Reads the next scheduled dose' },
  { phrase: 'Medicine taken.', purpose: 'Asks for confirmation, then records the dispensed dose as taken' },
  { phrase: "Show today's schedule.", purpose: 'Reads today\'s doses' },
  { phrase: 'Emergency call.', purpose: 'Asks for confirmation, then starts the simulated emergency workflow' },
  { phrase: 'Stop voice.', purpose: 'Stops speech output immediately' },
]
