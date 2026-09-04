import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { createInitialSession, submitUserMessage, type IntakeSession } from './intake/engine'
import { generateInsights } from './intake/insights'
import { hasAnyHpiFragments } from './intake/liveBrief'
import { INTAKE_STEPS, STEP_LABEL, stepIndex, type IntakeStep } from './intake/types'
import {
    generateGeminiClinicalInsights,
    getGeminiApiKey,
} from './lib/gemini'
import { readAppEnv } from './lib/runtimeEnv'
import { useTheme } from './useTheme'

const PROGRESS_SEGMENTS = INTAKE_STEPS.length - 1

function speechRecognitionLang(): string {
  const fromEnv = readAppEnv('VITE_SPEECH_LANG')
  if (fromEnv) return fromEnv
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.replace('_', '-')
  }
  return 'en-US'
}

/** Milliseconds between each character for the latest agent message */
const AGENT_TYPING_CHAR_MS = 16

/** Brief panel resize bounds (desktop). Persisted to localStorage. */
const BRIEF_MIN_PX = 320
const BRIEF_MAX_PX = 720
const BRIEF_DEFAULT_PX = 400
const BRIEF_WIDTH_KEY = 'wardly:briefWidthPx'

/** Auto-retry Gemini analysis a couple of times before silently giving up. */
const GEMINI_MAX_ATTEMPTS = 3
const GEMINI_RETRY_BASE_MS = 800

type BriefTab = 'cc' | 'hpi' | 'ros' | 'insights'

function usePrefersReducedMotion(): boolean {
  return useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
}

function AgentTypingContent({ content, animate }: { content: string; animate: boolean }) {
  const reduceMotion = usePrefersReducedMotion()
  const shouldAnimate = animate && !reduceMotion
  const fullLen = content.length
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    if (!shouldAnimate) return
    const id = window.setInterval(() => {
      setVisibleCount((prev) => {
        const next = Math.min(prev + 1, fullLen)
        if (next >= fullLen) window.clearInterval(id)
        return next
      })
    }, AGENT_TYPING_CHAR_MS)
    return () => window.clearInterval(id)
  }, [content, shouldAnimate, fullLen])

  const shown = shouldAnimate ? content.slice(0, visibleCount) : content
  const typing = shouldAnimate && visibleCount < fullLen
  const lines = shown.split('\n')

  return (
    <div className={`bubble__content${typing ? ' bubble__content--typing' : ''}`} aria-live="polite">
      {lines.map((line, i) => {
        const isLast = i === lines.length - 1
        return (
          <p key={i}>
            {line.trim() ? formatInlineEmphasis(line) : '\u00a0'}
            {typing && isLast ? <span className="agentTyping__cursor" aria-hidden /> : null}
          </p>
        )
      })}
    </div>
  )
}

function statusLabel(s: IntakeSession): string {
  if (s.step === 'complete' || s.complete) return 'Complete'
  return STEP_LABEL[s.step] ?? s.step
}

/** Compact "34F • Jane K." style label for the brief header chip. */
function formatDemographicsChip(d: {
  name: string
  ageNumber: number | null
  ageRaw: string
  sex: string
  sexRaw: string
}): string | null {
  const sexLetter =
    d.sex === 'male' ? 'M' : d.sex === 'female' ? 'F' : d.sex === 'non-binary' ? 'NB' : ''
  const ageStr = d.ageNumber != null ? `${d.ageNumber}` : d.ageRaw || ''
  const head = [ageStr, sexLetter].filter(Boolean).join('')
  const fallbackSex = !sexLetter && d.sexRaw ? d.sexRaw : ''
  const headFallback = head || (ageStr && fallbackSex ? `${ageStr} ${fallbackSex}` : ageStr || fallbackSex)
  if (!headFallback && !d.name) return null
  return [headFallback, d.name].filter(Boolean).join(' • ')
}

function titleCaseLabel(s: string): string {
  return s
    .split(' ')
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
}

function displayStepNumber(step: IntakeStep): number {
  const si = stepIndex(step)
  if (step === 'complete') return PROGRESS_SEGMENTS
  if (si <= 0) return 1
  return Math.min(si, PROGRESS_SEGMENTS)
}

function insightCardClass(level: 'info' | 'warning' | 'alert'): string {
  if (level === 'alert') return 'briefCard briefCard--insight briefCard--alert'
  if (level === 'warning') return 'briefCard briefCard--insight briefCard--warning'
  return 'briefCard briefCard--insight briefCard--infoInsight'
}

function badgeClass(level: 'info' | 'warning' | 'alert'): string {
  if (level === 'alert') return 'badge badge--alert'
  if (level === 'warning') return 'badge badge--warning'
  return 'badge badge--info'
}

function segmentStates(step: IntakeStep, complete: boolean): Array<'done' | 'active' | 'todo'> {
  const idx = stepIndex(step)
  if (complete || step === 'complete') {
    return Array.from({ length: PROGRESS_SEGMENTS }, () => 'done' as const)
  }
  return Array.from({ length: PROGRESS_SEGMENTS }, (_, i) => {
    if (idx === 0) {
      return i === 0 ? 'active' : 'todo'
    }
    if (i < idx - 1) return 'done'
    if (i === idx - 1) return 'active'
    return 'todo'
  })
}

const Icons = {
  Logo: ({ size = 24 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  Send: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  Brief: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  Reset: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <polyline points="3 3 3 8 8 8" />
    </svg>
  ),
  Copy: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  Mic: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ),
  Shield: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Ehr: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  Download: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  User: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Stop: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  ),
  Sun: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
  Moon: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
}

function App() {
  const { theme, toggleTheme } = useTheme()
  const [session, setSession] = useState<IntakeSession>(() => createInitialSession())
  const [input, setInput] = useState('')
  const [copyStatus, setCopyStatus] = useState('Copy to EHR')
  const [briefTab, setBriefTab] = useState<BriefTab>('cc')
  const [isListening, setIsListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [geminiAiText, setGeminiAiText] = useState<string | null>(null)
  const [geminiAiLoading, setGeminiAiLoading] = useState(false)
  const [voiceSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
  )
  const [briefWidth, setBriefWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return BRIEF_DEFAULT_PX
    const stored = window.localStorage?.getItem(BRIEF_WIDTH_KEY)
    const n = stored ? Number.parseInt(stored, 10) : NaN
    if (Number.isFinite(n)) return Math.min(BRIEF_MAX_PX, Math.max(BRIEF_MIN_PX, n))
    return BRIEF_DEFAULT_PX
  })
  const [isResizing, setIsResizing] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const speechFinalRef = useRef('')
  /** Chrome Web Speech `network` errors: one automatic retry per mic press */
  const speechNetworkAttemptRef = useRef(0)
  const speechRetryTimerRef = useRef<number | null>(null)
  const startVoiceInputRef = useRef<(opts?: { isAutoNetworkRetry?: boolean }) => Promise<void>>(
    () => Promise.resolve(),
  )
  const speechLangLabel = useMemo(() => speechRecognitionLang(), [])

  const insights = useMemo(
    () => (session.liveBrief.cc ? generateInsights(session.intake) : []),
    [session.intake, session.liveBrief.cc],
  )

  const send = useCallback(() => {
    setSession((prev) => submitUserMessage(prev, input))
    setInput('')
  }, [input])

  const onMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distance < 96
  }, [])

  // Scroll-to-bottom that keeps following the typing animation while the user
  // hasn't manually scrolled away. The previous one-shot smooth scroll fired
  // before the agent bubble had finished growing, so the latest reply ended up
  // off-screen.
  useEffect(() => {
    const el = messagesRef.current
    const sentinel = bottomRef.current
    if (!el || !sentinel) return
    if (!stickToBottomRef.current) return

    sentinel.scrollIntoView({ behavior: 'auto' })
    const start = Date.now()
    const id = window.setInterval(() => {
      if (!stickToBottomRef.current || Date.now() - start > 6000) {
        window.clearInterval(id)
        return
      }
      sentinel.scrollIntoView({ behavior: 'auto' })
    }, 80)
    return () => window.clearInterval(id)
  }, [session.messages.length])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage?.setItem(BRIEF_WIDTH_KEY, String(Math.round(briefWidth)))
    } catch {
      /* ignore storage failures */
    }
  }, [briefWidth])

  const onSplitterPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (typeof window === 'undefined') return
      if (window.matchMedia('(max-width: 1024px)').matches) return
      e.preventDefault()
      const startX = e.clientX
      const startWidth = briefWidth
      setIsResizing(true)
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'

      const onMove = (ev: PointerEvent) => {
        const dx = startX - ev.clientX
        const next = Math.max(BRIEF_MIN_PX, Math.min(BRIEF_MAX_PX, startWidth + dx))
        setBriefWidth(next)
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        setIsResizing(false)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [briefWidth],
  )

  const onSplitterKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = e.shiftKey ? 48 : 16
    setBriefWidth((w) => {
      const dir = e.key === 'ArrowLeft' ? 1 : -1
      return Math.max(BRIEF_MIN_PX, Math.min(BRIEF_MAX_PX, w + dir * step))
    })
  }, [])

  useEffect(() => {
    if (!session.complete) {
      inputRef.current?.focus()
    }
  }, [session.step, session.complete, session.messages.length])

  const runGeminiInsights = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      const signal = opts?.signal
      if (!session.brief || !getGeminiApiKey()) return
      setGeminiAiLoading(true)

      // Retry transient failures up to GEMINI_MAX_ATTEMPTS, then silently fall
      // back: keep any previously successful text on screen, otherwise leave
      // the AI panel hidden and let rule-based insights stand on their own.
      for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
        if (signal?.aborted) return
        try {
          const text = await generateGeminiClinicalInsights(session.brief)
          if (signal?.aborted) return
          setGeminiAiText(text)
          setGeminiAiLoading(false)
          return
        } catch (e) {
          if (signal?.aborted) return
          if (attempt < GEMINI_MAX_ATTEMPTS) {
            await new Promise((res) => window.setTimeout(res, GEMINI_RETRY_BASE_MS * attempt))
            continue
          }
          // Final attempt failed - keep prior text (if any) so the user still
          // sees the last good analysis. Do NOT surface the raw API error.
          if (import.meta.env.DEV) {
            console.warn('[gemini] giving up after retries:', e)
          }
          setGeminiAiLoading(false)
        }
      }
    },
    [session.brief],
  )

  useEffect(() => {
    if (!session.brief || !getGeminiApiKey()) return
    const ac = new AbortController()
    const tid = window.setTimeout(() => {
      void runGeminiInsights({ signal: ac.signal })
    }, 0)
    return () => {
      window.clearTimeout(tid)
      ac.abort()
    }
  }, [session.brief, runGeminiInsights])

  const stopVoiceInput = useCallback(() => {
    if (speechRetryTimerRef.current != null) {
      window.clearTimeout(speechRetryTimerRef.current)
      speechRetryTimerRef.current = null
    }
    try {
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
  }, [])

  const startVoiceInput = useCallback(
    async (opts?: { isAutoNetworkRetry?: boolean }) => {
      if (!voiceSupported || session.complete) return
      if (!opts?.isAutoNetworkRetry && isListening) return

      if (!opts?.isAutoNetworkRetry) {
        if (speechRetryTimerRef.current != null) {
          window.clearTimeout(speechRetryTimerRef.current)
          speechRetryTimerRef.current = null
        }
        speechNetworkAttemptRef.current = 0
        setVoiceError(null)
      }

      if (!window.isSecureContext && location.hostname !== 'localhost') {
        setVoiceError('Speech recognition needs HTTPS (or localhost).')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((t) => t.stop())
      } catch {
        setVoiceError('Microphone permission was denied or no microphone is available.')
        return
      }

      const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
      if (!Ctor) return

      try {
        recognitionRef.current?.abort()
      } catch {
        /* ignore */
      }

      const seed = (inputRef.current?.value ?? '').trimEnd()
      speechFinalRef.current = seed ? `${seed} ` : ''

      const recognition = new Ctor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = speechLangLabel

      recognition.onstart = () => setIsListening(true)
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const row = event.results[i]
          const piece = row[0]?.transcript ?? ''
          if (row.isFinal) {
            speechFinalRef.current += piece
          } else {
            interim += piece
          }
        }
        setInput((speechFinalRef.current + interim).trimEnd())
      }
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'aborted') return
        if (event.error === 'no-speech') {
          setVoiceError('No speech detected-try again or check your mic.')
        } else if (event.error === 'not-allowed') {
          setVoiceError('Speech recognition blocked. Allow microphone in the browser address bar.')
        } else if (event.error === 'network') {
          if (speechNetworkAttemptRef.current < 1) {
            speechNetworkAttemptRef.current += 1
            setVoiceError('Could not reach Google speech servers - retrying once in about 2 seconds…')
            speechRetryTimerRef.current = window.setTimeout(() => {
              speechRetryTimerRef.current = null
              void startVoiceInputRef.current({ isAutoNetworkRetry: true })
            }, 2000)
            setIsListening(false)
            return
          }
          setVoiceError(
            'Chrome sends your audio to Google for Web Speech. This failed after a retry. Try another Wi-Fi or cellular hotspot, turn VPN off briefly, or allow your network/firewall to reach Google. Corporate proxies often block this API - use the keyboard, Edge on another network, or host the app on HTTPS localhost.',
          )
        } else {
          setVoiceError(event.message || `Speech error: ${event.error}`)
        }
        setIsListening(false)
      }
      recognition.onend = () => setIsListening(false)

      recognitionRef.current = recognition
      try {
        recognition.start()
      } catch {
        setVoiceError('Could not start speech recognition.')
        setIsListening(false)
      }
    },
    [voiceSupported, session.complete, isListening, speechLangLabel],
  )

  useEffect(() => {
    startVoiceInputRef.current = startVoiceInput
  }, [startVoiceInput])

  const onReset = () => {
    if (speechRetryTimerRef.current != null) {
      window.clearTimeout(speechRetryTimerRef.current)
      speechRetryTimerRef.current = null
    }
    speechNetworkAttemptRef.current = 0
    setSession(createInitialSession())
    setInput('')
    setBriefTab('cc')
    setCopyStatus('Copy to EHR')
    setVoiceError(null)
    setGeminiAiText(null)
    setGeminiAiLoading(false)
    try {
      recognitionRef.current?.abort()
    } catch {
      /* ignore */
    }
    setIsListening(false)
  }

  const briefPlainText = useMemo(() => {
    if (!session.brief) return ''
    const d = session.intake.demographics
    const chip = formatDemographicsChip(d)
    const header = chip ? `Patient: ${chip}\n\n` : ''
    return `${header}CC: ${session.brief.cc}\n\nHPI: ${session.brief.hpi}\n\nROS: ${session.brief.ros}`
  }, [session.brief, session.intake.demographics])

  const onCopyBrief = () => {
    if (!briefPlainText) return
    void navigator.clipboard.writeText(briefPlainText)
    setCopyStatus('Copied!')
    setTimeout(() => setCopyStatus('Copy to EHR'), 2000)
  }

  const onDownloadBrief = () => {
    if (!briefPlainText) return
    const blob = new Blob([briefPlainText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `wardly-pre-visit-brief-${stamp}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const firstAgentId = session.messages.find((m) => m.role === 'agent')?.id
  const lastAgentMessageId = [...session.messages].reverse().find((m) => m.role === 'agent')?.id
  const segments = segmentStates(session.step, session.complete)
  const showFinalBrief = Boolean(session.brief)
  const lb = session.liveBrief
  const demographicsChip = formatDemographicsChip(session.intake.demographics)

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__headerLeft">
          <div className="app__branding">
            <span className="app__logoMark" aria-hidden>
              <Icons.Logo />
            </span>
            <div className="app__brandText">
              <h1 className="app__title">
                Wardly <span>Context Engine</span>
              </h1>
              <span className="app__badge">Pre-visit Clinical Intake</span>
            </div>
          </div>
        </div>
        <div className="app__headerTrust">
          <span className="app__hipaa">
            <Icons.Shield /> HIPAA Compliant
          </span>
        </div>
        <div className="app__headerActions">
          <button
            type="button"
            className="btn btn--ghost btn--themeToggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            <Icons.Reset /> Reset
          </button>
        </div>
      </header>

      <div className="app__progressRow" role="group" aria-label="Intake progress">
        <span className="app__progressLabel">{titleCaseLabel(statusLabel(session))}</span>
        <div className="app__progressSegments" aria-hidden>
          {segments.map((state, i) => (
            <span key={i} className={`app__progressSegment app__progressSegment--${state}`} />
          ))}
        </div>
        <span className="app__progressMeta">
          Step {displayStepNumber(session.step)} of {PROGRESS_SEGMENTS}
        </span>
      </div>

      <div
        className={`app__layout${isResizing ? ' app__layout--resizing' : ''}`}
        style={{ ['--brief-w' as string]: `${briefWidth}px` }}
      >
        <section className="app__chat" aria-label="Intake conversation">
          <div className="app__messages" ref={messagesRef} onScroll={onMessagesScroll}>
            {session.messages.map((m) => (
              <article key={m.id} className={`bubble bubble--${m.role}`}>
                {m.role === 'agent' ? (
                  <div className="bubble__card">
                    <div className="bubble__agentHead">
                      <span className="bubble__agentIcon" aria-hidden>
                        <Icons.Logo size={16} />
                      </span>
                      <span className="bubble__agentLabel">Wardly AI</span>
                      <span className="bubble__status">
                        <span className="bubble__statusDot" aria-hidden />
                        Active
                      </span>
                    </div>
                    {m.id === firstAgentId && (
                      <p className="bubble__disclaimer" role="note">
                        <span aria-hidden>⚠ </span>
                        This is not emergency care. Call 911 for emergencies.
                      </p>
                    )}
                    <AgentTypingContent
                      content={m.content}
                      animate={m.id === lastAgentMessageId}
                    />
                    <time className="bubble__time">
                      {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                ) : (
                  <>
                    <div className="bubble__roleUser">Patient</div>
                    <div className="bubble__content bubble__content--user">
                      {m.content.split('\n').map((line, i) => (
                        <p key={i}>{line.trim() ? formatInlineEmphasis(line) : '\u00a0'}</p>
                      ))}
                    </div>
                    <time className="bubble__time bubble__time--user">
                      {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </>
                )}
              </article>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            className="app__composer"
            onSubmit={(e) => {
              e.preventDefault()
              if (!input.trim() || session.complete) return
              send()
            }}
          >
            <div className="app__composerBar">
              <button
                type="button"
                className={`btn btn--mic${isListening ? ' btn--mic--listening' : ''}`}
                onClick={() => void startVoiceInput()}
                disabled={!voiceSupported || session.complete || isListening}
                aria-label="Start voice input"
                title={
                  !voiceSupported
                    ? 'Voice input not supported in this browser (try Chrome or Edge)'
                    : `Speak your reply (${speechLangLabel}). Browser will ask for microphone access.`
                }
              >
                <Icons.Mic />
              </button>
              <button
                type="button"
                className="btn btn--stop"
                onClick={stopVoiceInput}
                disabled={!isListening}
                aria-label="Stop recording"
                title="Stop speech recognition"
              >
                <Icons.Stop />
              </button>
              <div className="app__inputWrapper">
                <input
                  ref={inputRef}
                  type="text"
                  className="app__input"
                  placeholder={
                    session.complete ? 'Intake complete' : 'Describe your symptoms or reply here…'
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={session.complete}
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                className="btn btn--send"
                disabled={!input.trim() || session.complete}
                aria-label="Send message"
              >
                <Icons.Send />
              </button>
            </div>
          </form>
          <div className="app__composerMeta">
            {!voiceSupported ? (
              <p className="app__composerHint app__composerHint--warn" role="status">
                Voice typing needs a browser with Web Speech API (e.g. Chrome or Edge on desktop).
              </p>
            ) : null}
            {voiceError ? (
              <p className="app__composerHint app__composerHint--error" role="alert">
                {voiceError}
              </p>
            ) : null}
          </div>
        </section>

        <div
          className="app__splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the brief panel"
          aria-valuemin={BRIEF_MIN_PX}
          aria-valuemax={BRIEF_MAX_PX}
          aria-valuenow={Math.round(briefWidth)}
          tabIndex={0}
          onPointerDown={onSplitterPointerDown}
          onKeyDown={onSplitterKeyDown}
        >
          <span className="app__splitterGrip" aria-hidden />
        </div>

        <aside className="app__brief" aria-label="Structured clinical brief">
          <div className="app__briefHead">
            <div className="app__briefTitleRow">
              <h2 className="app__briefTitle">Structured Visit Brief</h2>
              {demographicsChip ? (
                <span className="app__patientChip" aria-label={`Patient demographics: ${demographicsChip}`}>
                  <Icons.User />
                  <span className="app__patientChipText">{demographicsChip}</span>
                </span>
              ) : null}
            </div>
            <p className="app__briefSub">Auto-generates as you chat</p>
            <div className="app__briefTabs" role="tablist" aria-label="Brief sections">
              {(
                [
                  ['cc', 'CC'],
                  ['hpi', 'HPI'],
                  ['ros', 'ROS'],
                  ['insights', 'Insights'],
                ] as const
              ).map(([id, label]) => {
                const active = briefTab === id
                const filled =
                  id === 'insights'
                    ? insights.length > 0 ||
                    Boolean(
                      session.brief &&
                      getGeminiApiKey() &&
                      (geminiAiText || geminiAiLoading),
                    )
                    : id === 'cc'
                      ? Boolean(session.brief?.cc || lb.cc)
                      : id === 'hpi'
                        ? Boolean(session.brief?.hpi || hasAnyHpiFragments(lb))
                        : Boolean(
                          session.brief?.ros ||
                          lb.rosProgress.length > 0 ||
                          session.intake.ros.length > 0,
                        )
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`app__briefTab${active ? ' app__briefTab--active' : ''}${filled ? ' app__briefTab--filled' : ''}`}
                    onClick={() => setBriefTab(id)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="app__briefBody">
            <div className="app__briefPanels">
              {briefTab === 'cc' && (
                <div className="briefCard briefCard--animate" style={{ animationDelay: '0ms' }}>
                  <h3 className="briefCard__h">Chief complaint</h3>
                  {demographicsChip ? (
                    <p className="briefCard__demographics">
                      <span className="briefCard__demographicsLabel">Patient</span>{' '}
                      {demographicsChip}
                    </p>
                  ) : null}
                  {showFinalBrief && session.brief ? (
                    <p className="briefCard__p">{session.brief.cc}</p>
                  ) : lb.cc ? (
                    <p className="briefCard__p">{lb.cc}</p>
                  ) : (
                    <p className="briefCard__p briefCard__p--muted">
                      Chief complaint will appear here after your first answer…
                    </p>
                  )}
                </div>
              )}
              {briefTab === 'hpi' && (
                <div className="briefCard briefCard--animate" style={{ animationDelay: '60ms' }}>
                  <h3 className="briefCard__h">
                    {showFinalBrief ? 'History of present illness' : 'History of present illness (building)'}
                  </h3>
                  {showFinalBrief && session.brief ? (
                    <ul className="briefHpiList">
                      {session.brief.hpi
                        .split(/\n\n+/)
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                    </ul>
                  ) : (
                    <div className="hpiBuilder">
                      {lb.hpiFragments.onset && (
                        <div className="hpiLine">
                          <span className="hpiLine__label">Onset</span> {lb.hpiFragments.onset}
                        </div>
                      )}
                      {lb.hpiFragments.duration && (
                        <div className="hpiLine">
                          <span className="hpiLine__label">Duration</span> {lb.hpiFragments.duration}
                        </div>
                      )}
                      {lb.hpiFragments.severity && (
                        <div className="hpiLine">
                          <span className="hpiLine__label">Severity</span> {lb.hpiFragments.severity}
                        </div>
                      )}
                      {lb.hpiFragments.location && (
                        <div className="hpiLine">
                          <span className="hpiLine__label">Location</span> {lb.hpiFragments.location}
                        </div>
                      )}
                      {lb.hpiFragments.quality && (
                        <div className="hpiLine">
                          <span className="hpiLine__label">Character</span> {lb.hpiFragments.quality}
                        </div>
                      )}
                      {lb.hpiFragments.modifiers && (
                        <div className="hpiLine">
                          <span className="hpiLine__label">Modifiers</span> {lb.hpiFragments.modifiers}
                        </div>
                      )}
                      {lb.hpiFragments.associatedSymptoms && (
                        <div className="hpiLine">
                          <span className="hpiLine__label">Associated</span>{' '}
                          {lb.hpiFragments.associatedSymptoms}
                        </div>
                      )}
                      {lb.redFlags && (
                        <div className="hpiLine hpiLine--triage">
                          <span className="hpiLine__label">Triage</span> {lb.redFlags}
                        </div>
                      )}
                      {!hasAnyHpiFragments(lb) && !lb.redFlags && (
                        <p className="briefCard__p briefCard__p--muted">
                          HPI will build as you answer OLDCART and triage questions…
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {briefTab === 'ros' && (
                <div className="briefCard briefCard--animate" style={{ animationDelay: '120ms' }}>
                  <h3 className="briefCard__h">Review of systems</h3>
                  {showFinalBrief && session.brief ? (
                    <div className="briefCard__ros">
                      {session.brief.ros.split('\n\n').map((para, i) => (
                        <p key={i} className="briefCard__p">
                          {formatInlineEmphasis(para)}
                        </p>
                      ))}
                    </div>
                  ) : session.intake.ros.length === 0 ? (
                    <p className="briefCard__p briefCard__p--muted">
                      Focused and general ROS appear after red-flag screening…
                    </p>
                  ) : (
                    <div className="rosLive">
                      {lb.rosProgress.length > 0 && (
                        <ul className="rosLive__progress" aria-label="ROS sections progress">
                          {lb.rosProgress.map((row, i) => (
                            <li key={i} className={`rosLive__chip rosLive__chip--${row.status}`}>
                              <span className="rosLive__system">{row.system}</span>
                              <span className="rosLive__status">
                                {row.status === 'completed' ? 'Captured' : 'Pending'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {session.intake.ros.map((r, i) => (
                        <div key={i} className="rosLive__block">
                          <p className="briefCard__p rosLive__systemTitle">
                            <strong>{r.system}</strong>
                          </p>
                          {r.positives.length > 0 && (
                            <p className="briefCard__p rosLive__detail">
                              <span className="rosLive__tag">Positive</span> {r.positives.join('; ')}
                            </p>
                          )}
                          {r.negatives.length > 0 && (
                            <p className="briefCard__p rosLive__detail">
                              <span className="rosLive__tag">Negative</span> {r.negatives.join('; ')}
                            </p>
                          )}
                          {r.positives.length === 0 && r.negatives.length === 0 && (
                            <p className="briefCard__p briefCard__p--muted">Awaiting response…</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {briefTab === 'insights' && (
                <div className="insightsPanel">
                  {session.brief && getGeminiApiKey() && (geminiAiLoading || geminiAiText) ? (
                    <div className="briefCard briefCard--gemini briefCard--animate">
                      <h3 className="briefCard__h">AI analysis</h3>
                      <p className="briefCard__p briefCard__p--muted geminiDisclaimer">
                        Generated automatically via Google Gemini when the brief is complete.
                      </p>
                      {geminiAiLoading ? (
                        <p className="aiAnalysisStatus aiAnalysisStatus--pending" role="status">
                          Running analysis…
                        </p>
                      ) : null}
                      {!geminiAiLoading && geminiAiText ? (
                        <p className="aiAnalysisStatus aiAnalysisStatus--ok" role="status">
                          Analysis completed successfully.
                        </p>
                      ) : null}
                      {geminiAiText ? (
                        <div className="geminiBody">
                          {geminiAiText.split('\n').map((line, i) =>
                            line.trim() ? (
                              <p key={i} className="briefCard__p geminiLine">
                                {line.trim()}
                              </p>
                            ) : null,
                          )}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn--outline geminiActions__btn"
                        onClick={() => void runGeminiInsights()}
                        disabled={geminiAiLoading || !session.brief}
                      >
                        {geminiAiLoading ? 'Running…' : 'Regenerate analysis'}
                      </button>
                    </div>
                  ) : session.brief && !getGeminiApiKey() ? (
                    <p className="insightsGeminiHint">
                      Add <code className="insightsGeminiHint__code">VITE_GEMINI_API_KEY</code> in{' '}
                      <code className="insightsGeminiHint__code">.env</code> (Google AI Studio) to enable automatic AI
                      analysis on this tab.
                    </p>
                  ) : null}

                  {insights.length === 0 ? (
                    <div className="briefCard briefCard--muted">
                      <h3 className="briefCard__h">Clinical insights</h3>
                      <p className="briefCard__p briefCard__p--muted">
                        Insights appear after the chief complaint is captured…
                      </p>
                    </div>
                  ) : (
                    <>
                      <h3 className="insightsPanel__sectionLabel">Clinical insights</h3>
                      {insights.map((insight, i) => (
                        <div
                          key={`${insight.title}-${i}`}
                          className={`${insightCardClass(insight.level)} briefCard--animate`}
                          style={{ animationDelay: `${i * 60}ms` }}
                        >
                          <div className="insightHeader">
                            <span className={badgeClass(insight.level)}>{insight.category}</span>
                            <h3 className="briefCard__h insightHeader__title">{insight.title}</h3>
                          </div>
                          <p className="briefCard__p">{insight.description}</p>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="app__briefFooter">
            <div className="app__briefFooterActions">
              <button
                type="button"
                className="btn btn--ehr"
                onClick={onCopyBrief}
                disabled={!session.brief}
              >
                <Icons.Ehr /> {copyStatus}
              </button>
              <button
                type="button"
                className="btn btn--outline btn--download"
                onClick={onDownloadBrief}
                disabled={!session.brief}
                title="Download the brief as a .txt file"
              >
                <Icons.Download /> Download
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

/**
 * Renders lightweight inline emphasis: `**bold**` and `*bold*` (both use .clinical-em).
 * Markdown uses `*` for italic, but agent copy uses single asterisks for short emphasis;
 * we treat paired single asterisks like `**` for readability in bubbles.
 */
function formatInlineEmphasis(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    if (bold) {
      return (
        <span key={i} className="clinical-em">
          {bold[1]}
        </span>
      )
    }
    const single = part.match(/^\*([^*]+)\*$/)
    if (single) {
      return (
        <span key={i} className="clinical-em">
          {single[1]}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export default App
