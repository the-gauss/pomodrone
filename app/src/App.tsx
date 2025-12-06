import { type CSSProperties, type JSX, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Mode = 'focus' | 'shortBreak' | 'longBreak'

type Settings = {
  focus: number
  shortBreak: number
  longBreak: number
  cycles: number
}

const DEFAULT_SETTINGS: Settings = {
  focus: 50 * 60,
  shortBreak: 10 * 60,
  longBreak: 25 * 60,
  cycles: 4,
}

const LABELS: Record<Mode, string> = {
  focus: 'Focus',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
}

type TabKey = 'timer' | 'session' | 'stats' | 'profile'

const TAB_CONFIG: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'timer', label: 'Timer' },
  { key: 'session', label: 'Session setup' },
  { key: 'stats', label: 'Insights' },
  { key: 'profile', label: 'More' },
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

const loadSettings = (): Settings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  const raw = localStorage.getItem('pomodrone-settings')
  if (!raw) return DEFAULT_SETTINGS
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch (error) {
    console.warn('Falling back to defaults', error)
    return DEFAULT_SETTINGS
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

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
  const fillPercent = ((minutes - min) / (max - min)) * 100
  return (
    <div className="setting-row">
      <div className="setting-header">
        <span className="setting-label">{label}</span>
        <span className="setting-value">{formatTime(Math.round(minutes * 60))}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={minutes}
        disabled={disabled}
        style={{ '--range-fill': `${fillPercent}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
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

  const audioCtxRef = useRef<AudioContext | null>(null)

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

  const previousDurationRef = useRef(baseDuration)

  useEffect(() => {
    if (baseDuration === previousDurationRef.current) return
    previousDurationRef.current = baseDuration
    if (!isRunning) {
      setSecondsLeft(baseDuration)
    }
  }, [baseDuration, isRunning])

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
          const updated = nextStage()
          setMode(updated.mode)
          setCurrentCycle(updated.cycle)
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
  ])

  const updateDuration = (key: 'focus' | 'shortBreak' | 'longBreak', nextMinutes: number) => {
    const seconds = clamp(Math.round(nextMinutes * 60), 60, 120 * 60)
    setSettings((prev) => ({ ...prev, [key]: seconds }))
    if (!isRunning && mode === key) {
      setSecondsLeft(seconds)
    }
  }

  const updateCycles = (value: number) => {
    const nextCycles = clamp(Math.round(value), 1, 12)
    setSettings((prev) => ({ ...prev, cycles: nextCycles }))
    setCurrentCycle((prev) => Math.min(prev, nextCycles))
  }

  const toggleRun = () => {
    if (!isRunning && tickEnabled) {
      ensureAudio()
    }
    setIsRunning((prev) => !prev)
  }

  const resetTimer = () => {
    setIsRunning(false)
    setSecondsLeft(baseDuration)
  }

  const resetAll = () => {
    setIsRunning(false)
    setSettings(DEFAULT_SETTINGS)
    setMode('focus')
    setCurrentCycle(1)
    setSecondsLeft(DEFAULT_SETTINGS.focus)
  }

  const skipStage = () => {
    const keepRunning = isRunning
    const updated = nextStage()
    setMode(updated.mode)
    setCurrentCycle(updated.cycle)
    setSecondsLeft(updated.duration)
    setIsRunning(keepRunning)
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
                min={15}
                max={120}
                disabled={isRunning}
                onChange={(value) => updateDuration('focus', value)}
              />
              <SettingSlider
                label="Short Break"
                minutes={Math.round(settings.shortBreak / 60)}
                min={3}
                max={30}
                disabled={isRunning}
                onChange={(value) => updateDuration('shortBreak', value)}
              />
              <SettingSlider
                label="Long Break"
                minutes={Math.round(settings.longBreak / 60)}
                min={10}
                max={45}
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
                <span className="switch-label">
                  {tickEnabled ? 'Tick sound on' : 'Tick sound muted'}
                </span>
              </button>
            </div>
          </section>
        )}

        {activeTab === 'stats' && (
          <section className="placeholder-panel tab-panel">
            <p className="panel-title">Insights</p>
            <p className="panel-subtitle">Session insights are on the way.</p>
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
