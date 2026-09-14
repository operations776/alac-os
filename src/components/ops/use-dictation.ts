'use client'

/**
 * Talk instead of type, through the browser's own speech recognition.
 *
 * No audio leaves for a service we pay for: Chrome and Edge ship the Web
 * Speech API, Firefox and Safari mostly do not, so `supported` is false there
 * and the mic says why instead of failing on click.
 *
 * The transcript is rebuilt from the whole session on every result rather
 * than appended chunk by chunk, so interim words are replaced as the browser
 * firms them up instead of piling up as duplicates.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

interface Alternative { transcript: string }
interface SpeechResult { isFinal: boolean; 0: Alternative }
interface SpeechEvent { results: ArrayLike<SpeechResult> }
interface Recognizer {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type RecognizerCtor = new () => Recognizer

function ctor(): RecognizerCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Stop listening after this long with no new words. */
const SILENCE_MS = 6000

export function useDictation(text: string, setText: (s: string) => void) {
  const supported = useSyncExternalStore(() => () => {}, () => Boolean(ctor()), () => false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Recognizer | null>(null)
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = useCallback(() => {
    if (silence.current) clearTimeout(silence.current)
    rec.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = ctor()
    if (!Ctor || rec.current) return
    setError(null)
    const base = text.trimEnd()
    const r = new Ctor()
    r.continuous = true
    r.interimResults = true
    r.lang = navigator.language || 'en-US'

    const armSilence = () => {
      if (silence.current) clearTimeout(silence.current)
      silence.current = setTimeout(() => r.stop(), SILENCE_MS)
    }
    r.onresult = (e) => {
      let spoken = ''
      for (let i = 0; i < e.results.length; i++) spoken += e.results[i][0].transcript
      spoken = spoken.trim()
      setText(base && spoken ? `${base} ${spoken}` : base || spoken)
      armSilence()
    }
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Microphone access is blocked. Allow it in the browser address bar.'
        : `Voice stopped: ${e.error}.`)
    }
    r.onend = () => {
      if (silence.current) clearTimeout(silence.current)
      rec.current = null
      setListening(false)
    }
    rec.current = r
    r.start()
    setListening(true)
    armSilence()
  }, [text, setText])

  // A closed dialog must not keep the microphone open.
  useEffect(() => () => {
    if (silence.current) clearTimeout(silence.current)
    rec.current?.stop()
  }, [])

  return { supported, listening, error, start, stop }
}
