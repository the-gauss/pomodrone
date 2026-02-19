import {
  type CSSProperties,
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  AnalyticsSummary,
  AnalyticsWindowSummary,
  SessionReason,
  SessionRecordPayload,
} from './analytics-api'
import './App.css'

type Mode = 'focus' | 'shortBreak' | 'longBreak'

type Settings = {
  focus: number
  shortBreak: number
  longBreak: number
  cycles: number
}

type TabKey = 'timer' | 'session' | 'stats' | 'profile'
type AnalyticsWindowKey = 'sevenDay' | 'thirtyDay' | 'allTime'

type ActiveSessionDraft = {
  sessionId: string
  mode: Mode
  cycleIndex: number
  plannedSeconds: number
  startedAt: string
}

const DEFAULT_SETTINGS: Settings = {
  focus: 50 * 60,
  shortBreak: 10 * 60,
  longBreak: 25 * 60,
  cycles: 4,
}

const DURATION_LIMITS: Record<Mode, { min: number; max: number }> = {
  focus: { min: 1, max: 150 },
  shortBreak: { min: 1, max: 20 },
  longBreak: { min: 1, max: 45 },
}

const LABELS: Record<Mode, string> = {
  focus: 'Focus',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
}

const TAB_CONFIG: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'timer', label: 'Timer' },
  { key: 'session', label: 'Session setup' },
  { key: 'stats', label: 'Insights' },
  { key: 'profile', label: 'More' },
]

const ANALYTICS_WINDOWS: ReadonlyArray<{ key: AnalyticsWindowKey; label: string }> = [
  { key: 'sevenDay', label: 'Last 7 days' },
  { key: 'thirtyDay', label: 'Last 30 days' },
  { key: 'allTime', label: 'All time' },
]

const TAB_ICONS: Record<TabKey, () => JSX.Element> = {
  timer: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="2.25" width="6" height="2.5" rx="1" fill="currentColor" />
      <circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 13V8.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="1.6" fill="currentColor" />
    </svg>
  ),
  session: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="6" width="16" height="2" rx="1" fill="currentColor" opacity="0.85" />
      <rect x="4" y="11" width="16" height="2" rx="1" fill="currentColor" />
      <rect x="4" y="16" width="16" height="2" rx="1" fill="currentColor" opacity="0.85" />
      <circle cx="16" cy="7" r="1.5" fill="var(--bg)" />
      <circle cx="9" cy="12" r="1.5" fill="var(--bg)" />
      <circle cx="13" cy="17" r="1.5" fill="var(--bg)" />
    </svg>
  ),
  stats: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="13" width="3" height="6" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="10.5" y="9" width="3" height="10" rx="1" fill="currentColor" />
      <rect x="16" y="5" width="3" height="14" rx="1" fill="currentColor" opacity="0.9" />
      <path
        d="M4 20h16"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  ),
  profile: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="9" r="4" fill="currentColor" />
      <path
        d="M6 20c0-2.7614 2.6863-5 6-5s6 2.2386 6 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
}

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const formatPercent = (value: number) => `${Math.round(Math.max(0, value) * 100)}%`

const formatDuration = (seconds: number) => {
  const totalMinutes = Math.max(0, Math.round(seconds / 60))
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
  }
  return `${totalMinutes}m`
}

const buildPressureMessage = (summary: AnalyticsWindowSummary) => {
  if (summary.totalSessions === 0) {
    return 'Finish your first session to start a momentum streak.'
  }

  if (summary.completionRate < 0.55) {
    return `You leaked ${formatDuration(summary.unfinishedSeconds)} this window. Closing sessions now recovers your pace.`
  }

  if (summary.completionRate < 0.8) {
    return 'You are close to consistency. Finish the next session fully to tighten your finish discipline.'
  }

  return 'You are in a high-completion rhythm. Keep finishing to protect your momentum streak.'
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const clampDurationSeconds = (mode: Mode, seconds: number) => {
  const limits = DURATION_LIMITS[mode]
  return clamp(Math.round(seconds), limits.min * 60, limits.max * 60)
}

const sanitizeSettings = (settings: Partial<Settings>): Settings => ({
  focus: clampDurationSeconds('focus', settings.focus ?? DEFAULT_SETTINGS.focus),
  shortBreak: clampDurationSeconds('shortBreak', settings.shortBreak ?? DEFAULT_SETTINGS.shortBreak),
  longBreak: clampDurationSeconds('longBreak', settings.longBreak ?? DEFAULT_SETTINGS.longBreak),
  cycles: clamp(Math.round(settings.cycles ?? DEFAULT_SETTINGS.cycles), 1, 12),
})

const loadSettings = (): Settings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  const raw = localStorage.getItem('pomodrone-settings')
  if (!raw) return DEFAULT_SETTINGS
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>
    return sanitizeSettings(parsed)
  } catch (error) {
    console.warn('Falling back to defaults', error)
    return DEFAULT_SETTINGS
  }
}

const createSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `session_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

const createSessionDraft = (
  mode: Mode,
  cycleIndex: number,
  plannedSeconds: number,
): ActiveSessionDraft => ({
  sessionId: createSessionId(),
  mode,
  cycleIndex,
  plannedSeconds: Math.max(1, Math.round(plannedSeconds)),
  startedAt: new Date().toISOString(),
})

const SettingSlider = ({
  label,
  minutes,
  min,
  max,
  step = 1,
  onChange,
  disabled,
}: {
  label: string
  minutes: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  onChange: (nextMinutes: number) => void
}) => {
  const safeMinutes = clamp(Math.round(minutes), min, max)
  const fillPercent = ((safeMinutes - min) / (max - min || 1)) * 100

  return (
    <div className="setting-row">
      <div className="setting-header">
        <span className="setting-label">{label}</span>
        <div className="setting-value-group">
          <span className="setting-value">{formatTime(safeMinutes * 60)}</span>
          <label className="minute-input-wrap">
            <span className="minute-input-prefix">min</span>
            <input
              type="number"
              min={min}
              max={max}
              step={1}
              disabled={disabled}
              className="minute-input"
              value={safeMinutes}
              onChange={(event) => {
                const next = Number(event.target.value)
                onChange(Number.isFinite(next) ? clamp(Math.round(next), min, max) : min)
              }}
            />
          </label>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeMinutes}
        disabled={disabled}
        style={{ '--range-fill': `${fillPercent}%` } as CSSProperties}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
      />
    </div>
  )
}

function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [mode, setMode] = useState<Mode>('focus')
  const [currentCycle, setCurrentCycle] = useState(1)
  const [secondsLeft, setSecondsLeft] = useState(settings.focus)
  const [isRunning, setIsRunning] = useState(false)
  const [tickEnabled, setTickEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('pomodrone-tick')
    return stored ? stored === 'true' : true
  })
  const [activeTab, setActiveTab] = useState<TabKey>('timer')
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const secondsLeftRef = useRef(secondsLeft)
  const isRunningRef = useRef(isRunning)
  const activeSessionRef = useRef<ActiveSessionDraft>(
    createSessionDraft(mode, currentCycle, settings.focus),
  )

  useEffect(() => {
    secondsLeftRef.current = secondsLeft
  }, [secondsLeft])

  useEffect(() => {
    isRunningRef.current = isRunning
  }, [isRunning])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const minScale = 0.55
    const maxScale = 1
    const referenceWidth = 420
    const root = document.documentElement

    const updateScale = () => {
      const width = window.innerWidth || referenceWidth
      const proportional = width / referenceWidth
      const next = Math.min(maxScale, Math.max(minScale, proportional))
      root.style.setProperty('--ui-scale', next.toString())
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  const baseDuration = useMemo(() => {
    switch (mode) {
      case 'shortBreak':
        return settings.shortBreak
      case 'longBreak':
        return settings.longBreak
      default:
        return settings.focus
    }
  }, [mode, settings.focus, settings.longBreak, settings.shortBreak])

  const selectedWindow = analyticsSummary?.sevenDay

  const loadAnalyticsSummary = useCallback(async () => {
    if (!window.analyticsApi) {
      setAnalyticsLoading(false)
      setAnalyticsError('Insights backend is unavailable in this runtime.')
      return
    }

    try {
      const response = await window.analyticsApi.getSummary()
      setAnalyticsSummary(response)
      setAnalyticsError(null)
    } catch (error) {
      console.error('Failed to load analytics summary', error)
      setAnalyticsError('Unable to load insights right now.')
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  const persistSession = useCallback(
    async (payload: SessionRecordPayload) => {
      if (!window.analyticsApi) return

      try {
        await window.analyticsApi.recordSession(payload)
        const response = await window.analyticsApi.getSummary()
        setAnalyticsSummary(response)
        setAnalyticsError(null)
      } catch (error) {
        console.error('Failed to persist session analytics', error)
        setAnalyticsError('Session tracking failed to persist for one event.')
      }
    },
    [],
  )

  const restartSessionDraft = useCallback((nextMode: Mode, cycleIndex: number, duration: number) => {
    activeSessionRef.current = createSessionDraft(nextMode, cycleIndex, duration)
  }, [])

  const finalizeActiveSession = useCallback(
    (
      reason: SessionReason,
      options?: {
        forcedActualSeconds?: number
        markSkipped?: boolean
      },
    ) => {
      const draft = activeSessionRef.current
      const inferredActual = draft.plannedSeconds - secondsLeftRef.current
      const actualSeconds = Math.max(
        0,
        Math.min(draft.plannedSeconds, Math.round(options?.forcedActualSeconds ?? inferredActual)),
      )

      if (actualSeconds <= 0 && reason !== 'completed') {
        return
      }

      const completionRatio =
        draft.plannedSeconds > 0 ? Math.min(1, actualSeconds / draft.plannedSeconds) : 0
      const completed = reason === 'completed' || completionRatio >= 0.999

      const payload: SessionRecordPayload = {
        sessionId: draft.sessionId,
        startedAt: draft.startedAt,
        endedAt: new Date().toISOString(),
        mode: draft.mode,
        plannedSeconds: draft.plannedSeconds,
        actualSeconds,
        completionRatio,
        completed,
        wasSkipped: Boolean(options?.markSkipped),
        cycleIndex: draft.cycleIndex,
        reason,
      }

      // Persist each finalized session immediately so analytics stays up to date.
      void persistSession(payload)
    },
    [persistSession],
  )

  useEffect(() => {
    void loadAnalyticsSummary()
  }, [loadAnalyticsSummary])

  const previousDurationRef = useRef(baseDuration)

  useEffect(() => {
    if (baseDuration === previousDurationRef.current) return
    previousDurationRef.current = baseDuration

    if (!isRunningRef.current) {
      setSecondsLeft(baseDuration)
      restartSessionDraft(mode, currentCycle, baseDuration)
    }
  }, [baseDuration, currentCycle, mode, restartSessionDraft])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pomodrone-settings', JSON.stringify(settings))
    }
  }, [settings])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pomodrone-tick', String(tickEnabled))
    }
  }, [tickEnabled])

  const ensureAudio = () => {
    if (!tickEnabled) return null

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }

    return audioCtxRef.current
  }

  const playTick = () => {
    const ctx = ensureAudio()
    if (!ctx) return

    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.frequency.value = 880
    gain.gain.value = 0.02

    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.05)
  }

  const playEndChime = () => {
    const ctx = ensureAudio()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.value = 620
    gain.gain.setValueAtTime(0.05, now)
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.5)

    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.55)
  }

  const nextStage = () => {
    if (mode === 'focus') {
      if (currentCycle >= settings.cycles) {
        return { mode: 'longBreak' as Mode, cycle: currentCycle, duration: settings.longBreak }
      }
      return { mode: 'shortBreak' as Mode, cycle: currentCycle, duration: settings.shortBreak }
    }

    if (mode === 'shortBreak') {
      return { mode: 'focus' as Mode, cycle: currentCycle + 1, duration: settings.focus }
    }

    return { mode: 'focus' as Mode, cycle: 1, duration: settings.focus }
  }

  useEffect(() => {
    if (!isRunning) return

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          playEndChime()

          finalizeActiveSession('completed', {
            forcedActualSeconds: activeSessionRef.current.plannedSeconds,
          })

          const updated = nextStage()
          setMode(updated.mode)
          setCurrentCycle(updated.cycle)
          restartSessionDraft(updated.mode, updated.cycle, updated.duration)
          return updated.duration
        }

        if (tickEnabled) {
          playTick()
        }

        return prev - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [
    isRunning,
    mode,
    currentCycle,
    settings.focus,
    settings.shortBreak,
    settings.longBreak,
    settings.cycles,
    tickEnabled,
    finalizeActiveSession,
    restartSessionDraft,
  ])

  const updateDuration = (key: 'focus' | 'shortBreak' | 'longBreak', nextMinutes: number) => {
    const limits = DURATION_LIMITS[key]
    const boundedMinutes = clamp(Math.round(nextMinutes), limits.min, limits.max)
    const seconds = boundedMinutes * 60
    setSettings((prev) => ({ ...prev, [key]: seconds }))

    if (!isRunningRef.current && mode === key) {
      setSecondsLeft(seconds)
      restartSessionDraft(mode, currentCycle, seconds)
    }
  }

  const updateCycles = (value: number) => {
    const nextCycles = clamp(Math.round(value), 1, 12)
    setSettings((prev) => ({ ...prev, cycles: nextCycles }))
    setCurrentCycle((prev) => Math.min(prev, nextCycles))
  }

  const toggleRun = () => {
    if (!isRunningRef.current && tickEnabled) {
      ensureAudio()
    }
    setIsRunning((prev) => !prev)
  }

  const resetTimer = () => {
    const draft = activeSessionRef.current
    const elapsed = Math.max(0, draft.plannedSeconds - secondsLeftRef.current)

    if (elapsed > 0 || isRunningRef.current) {
      finalizeActiveSession('reset', { forcedActualSeconds: elapsed })
      restartSessionDraft(mode, currentCycle, baseDuration)
    }

    setIsRunning(false)
    setSecondsLeft(baseDuration)
  }

  const resetAll = () => {
    const draft = activeSessionRef.current
    const elapsed = Math.max(0, draft.plannedSeconds - secondsLeftRef.current)

    if (elapsed > 0 || isRunningRef.current) {
      finalizeActiveSession('reset', { forcedActualSeconds: elapsed })
    }

    setIsRunning(false)
    setSettings(DEFAULT_SETTINGS)
    setMode('focus')
    setCurrentCycle(1)
    setSecondsLeft(DEFAULT_SETTINGS.focus)
    restartSessionDraft('focus', 1, DEFAULT_SETTINGS.focus)
  }

  const skipStage = () => {
    const draft = activeSessionRef.current
    const elapsed = Math.max(0, draft.plannedSeconds - secondsLeftRef.current)

    if (elapsed > 0 || isRunningRef.current) {
      finalizeActiveSession('skipped', {
        forcedActualSeconds: elapsed,
        markSkipped: true,
      })
    }

    const keepRunning = isRunningRef.current
    const updated = nextStage()
    setMode(updated.mode)
    setCurrentCycle(updated.cycle)
    setSecondsLeft(updated.duration)
    setIsRunning(keepRunning)
    restartSessionDraft(updated.mode, updated.cycle, updated.duration)
  }

  const progress = Math.min(1, Math.max(0, 1 - secondsLeft / baseDuration))
  const progressDeg = `${progress * 360}deg`

  return (
    <main className="app-shell">
      <div className="title-bar" />
      <div className="frame">
        {activeTab === 'timer' && (
          <>
            <header className="header">
              <div className="brand">
                <div className="logo-plate">
                  <img src="/logo-placeholder.png" alt="Pomodrone logo" />
                </div>
                <div>
                  <p className="eyebrow">Pomodrone</p>
                  <p className="eyebrow muted">{LABELS[mode]} session</p>
                </div>
              </div>
              <div className="cycle">
                <span className="cycle-current">{currentCycle}</span>
                <span className="cycle-total">/ {settings.cycles}</span>
              </div>
            </header>

            <section className="timer-section">
              <div
                className="timer-ring"
                style={{ '--progress-deg': progressDeg } as CSSProperties}
                aria-label={`${LABELS[mode]} time remaining`}
              >
                <div className="timer-core">
                  <p className="mode-label">{LABELS[mode]}</p>
                  <p className="time-reading">{formatTime(secondsLeft)}</p>
                  <p className="state">{isRunning ? 'On the clock' : 'Ready to start'}</p>
                </div>
              </div>

              <div className="controls">
                <button className="primary" onClick={toggleRun}>
                  {isRunning ? 'Pause' : 'Start'}
                </button>
                <div className="secondary-controls">
                  <button className="secondary" onClick={skipStage}>
                    Skip
                  </button>
                  <button className="secondary" onClick={resetTimer}>
                    Reset
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'session' && (
          <section className="settings-panel tab-panel">
            <div className="panel-head">
              <div>
                <p className="panel-title">Session setup</p>
                <p className="panel-subtitle">Dial in your focus, breaks, and rounds.</p>
              </div>
              <button className="text-link" onClick={resetAll}>
                Reset defaults
              </button>
            </div>

            <div className="settings-stack">
              <SettingSlider
                label="Focus"
                minutes={Math.round(settings.focus / 60)}
                min={DURATION_LIMITS.focus.min}
                max={DURATION_LIMITS.focus.max}
                disabled={isRunning}
                onChange={(value) => updateDuration('focus', value)}
              />
              <SettingSlider
                label="Short Break"
                minutes={Math.round(settings.shortBreak / 60)}
                min={DURATION_LIMITS.shortBreak.min}
                max={DURATION_LIMITS.shortBreak.max}
                disabled={isRunning}
                onChange={(value) => updateDuration('shortBreak', value)}
              />
              <SettingSlider
                label="Long Break"
                minutes={Math.round(settings.longBreak / 60)}
                min={DURATION_LIMITS.longBreak.min}
                max={DURATION_LIMITS.longBreak.max}
                disabled={isRunning}
                onChange={(value) => updateDuration('longBreak', value)}
              />

              <div className="setting-row">
                <div className="setting-header">
                  <span className="setting-label">Rounds</span>
                  <span className="setting-value">{settings.cycles}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  disabled={isRunning}
                  value={settings.cycles}
                  style={{ '--range-fill': `${(settings.cycles / 12) * 100}%` } as CSSProperties}
                  onChange={(event) => updateCycles(Number(event.target.value))}
                />
              </div>
            </div>

            <div className="toggles">
              <button
                className={`toggle-switch ${tickEnabled ? 'active' : ''}`}
                onClick={() => setTickEnabled((prev) => !prev)}
                role="switch"
                aria-checked={tickEnabled}
                type="button"
              >
                <span className="switch-visual" aria-hidden>
                  <span className="switch-thumb" />
                </span>
                <span className="switch-label">{tickEnabled ? 'Tick sound on' : 'Tick sound muted'}</span>
              </button>
            </div>
          </section>
        )}

        {activeTab === 'stats' && (
          <section className="settings-panel tab-panel analytics-panel">
            <div className="panel-head">
              <div>
                <p className="panel-title">Insights</p>
                <p className="panel-subtitle">Your finish discipline and momentum windows.</p>
              </div>
              <button className="text-link" onClick={() => void loadAnalyticsSummary()}>
                Refresh
              </button>
            </div>

            {analyticsLoading && !analyticsSummary && (
              <p className="panel-subtitle analytics-state">Loading your insights...</p>
            )}

            {analyticsError && <p className="analytics-error">{analyticsError}</p>}

            {analyticsSummary && selectedWindow && (
              <>
                <div className="finish-drive">
                  <div>
                    <p className="finish-drive-label">Finish Pressure Score</p>
                    <p className="finish-drive-score">{selectedWindow.finishPressureScore}</p>
                  </div>
                  <div className="finish-drive-meter" aria-hidden>
                    <span
                      className="finish-drive-fill"
                      style={{ width: `${selectedWindow.finishPressureScore}%` }}
                    />
                  </div>
                  <p className="finish-drive-text">{buildPressureMessage(selectedWindow)}</p>
                </div>

                <div className="analytics-grid">
                  {ANALYTICS_WINDOWS.map((windowDef) => {
                    const item = analyticsSummary[windowDef.key]
                    return (
                      <article key={windowDef.key} className="analytics-card">
                        <p className="analytics-card-label">{windowDef.label}</p>
                        <p className="analytics-card-value">{formatPercent(item.completionRate)}</p>
                        <p className="analytics-card-meta">
                          {item.completedSessions} finished / {item.totalSessions} sessions
                        </p>
                        <p className="analytics-card-meta">
                          Focus time {formatDuration(item.focusActualSeconds)}
                        </p>
                        <p className="analytics-card-meta">Streak {item.streakDays} days</p>
                      </article>
                    )
                  })}
                </div>

                <p className="analytics-footnote">
                  Unfinished load this week: {formatDuration(selectedWindow.unfinishedSeconds)}. Closing
                  sessions consistently protects your pace.
                </p>
              </>
            )}
          </section>
        )}

        {activeTab === 'profile' && (
          <section className="placeholder-panel tab-panel">
            <p className="panel-title">Companion</p>
            <p className="panel-subtitle">More tools will arrive in future builds.</p>
          </section>
        )}
      </div>
      <nav className="tab-bar">
        {TAB_CONFIG.map((tab) => {
          const Icon = TAB_ICONS[tab.key]
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              className={`tab-button ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="tab-icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="sr-only">{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </main>
  )
}

export default App
