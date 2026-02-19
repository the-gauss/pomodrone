const fs = require('node:fs/promises')
const path = require('node:path')

const ANALYTICS_DIR = 'analytics'
const ANALYTICS_FILE = 'sessions.csv'
const CSV_HEADERS = [
  'session_id',
  'started_at',
  'ended_at',
  'mode',
  'planned_seconds',
  'actual_seconds',
  'completion_ratio',
  'completed',
  'was_skipped',
  'cycle_index',
  'reason',
]

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * AnalyticsStore persists session-level telemetry to CSV and computes aggregate metrics.
 * CSV keeps the data human-inspectable and portable while avoiding any database dependency.
 */
class AnalyticsStore {
  constructor(baseDir) {
    this.baseDir = baseDir
    this.analyticsDir = path.join(baseDir, ANALYTICS_DIR)
    this.analyticsPath = path.join(this.analyticsDir, ANALYTICS_FILE)
    this.initialized = false
  }

  async initialize() {
    if (this.initialized) return

    await fs.mkdir(this.analyticsDir, { recursive: true })
    try {
      await fs.access(this.analyticsPath)
    } catch {
      await fs.writeFile(this.analyticsPath, `${CSV_HEADERS.join(',')}\n`, 'utf8')
    }

    this.initialized = true
  }

  async appendSession(rawSession) {
    await this.initialize()

    const session = normalizeSession(rawSession)
    const line = [
      session.sessionId,
      session.startedAt,
      session.endedAt,
      session.mode,
      session.plannedSeconds,
      session.actualSeconds,
      session.completionRatio.toFixed(4),
      session.completed,
      session.wasSkipped,
      session.cycleIndex,
      session.reason,
    ]
      .map(escapeCsv)
      .join(',')

    await fs.appendFile(this.analyticsPath, `${line}\n`, 'utf8')
    return session
  }

  async getSummary() {
    await this.initialize()
    const records = await this.readAllRecords()

    return {
      lastUpdatedAt: new Date().toISOString(),
      storagePath: this.analyticsPath,
      sevenDay: summarizeWindow(records, 7),
      thirtyDay: summarizeWindow(records, 30),
      allTime: summarizeWindow(records, null),
    }
  }

  async readAllRecords() {
    const raw = await fs.readFile(this.analyticsPath, 'utf8')
    const lines = raw.split('\n').filter(Boolean)
    if (lines.length <= 1) return []

    return lines
      .slice(1)
      .map(parseCsvLine)
      .filter((row) => row.length === CSV_HEADERS.length)
      .map((row) => {
        const [
          sessionId,
          startedAt,
          endedAt,
          mode,
          plannedSeconds,
          actualSeconds,
          completionRatio,
          completed,
          wasSkipped,
          cycleIndex,
          reason,
        ] = row

        return {
          sessionId,
          startedAt,
          endedAt,
          mode,
          plannedSeconds: parseSafeNumber(plannedSeconds),
          actualSeconds: parseSafeNumber(actualSeconds),
          completionRatio: parseSafeNumber(completionRatio),
          completed: completed === 'true',
          wasSkipped: wasSkipped === 'true',
          cycleIndex: parseSafeNumber(cycleIndex),
          reason,
        }
      })
      .filter((record) => Number.isFinite(record.plannedSeconds) && Number.isFinite(record.actualSeconds))
  }
}

const normalizeSession = (session) => {
  const plannedSeconds = Math.max(1, Math.round(parseSafeNumber(session.plannedSeconds)))
  const actualSeconds = Math.max(0, Math.round(parseSafeNumber(session.actualSeconds)))
  const clampedActual = Math.min(actualSeconds, plannedSeconds)
  const completionRatio = clampNumber(
    Number.isFinite(session.completionRatio)
      ? Number(session.completionRatio)
      : clampedActual / plannedSeconds,
    0,
    1,
  )

  return {
    sessionId: String(session.sessionId || `session_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`),
    startedAt: toIso(session.startedAt),
    endedAt: toIso(session.endedAt),
    mode: normalizeMode(session.mode),
    plannedSeconds,
    actualSeconds: clampedActual,
    completionRatio,
    completed: Boolean(session.completed || completionRatio >= 0.999),
    wasSkipped: Boolean(session.wasSkipped),
    cycleIndex: Math.max(1, Math.round(parseSafeNumber(session.cycleIndex) || 1)),
    reason: normalizeReason(session.reason),
  }
}

const summarizeWindow = (records, dayWindow) => {
  const now = Date.now()
  const cutoff = dayWindow ? now - dayWindow * DAY_MS : null
  const relevant =
    cutoff === null
      ? records
      : records.filter((record) => {
          const ended = Date.parse(record.endedAt)
          return Number.isFinite(ended) && ended >= cutoff
        })

  const totalSessions = relevant.length
  const completedSessions = relevant.filter((record) => record.completed).length
  const completionRate = totalSessions === 0 ? 0 : completedSessions / totalSessions

  const totalPlannedSeconds = relevant.reduce((sum, record) => sum + record.plannedSeconds, 0)
  const totalActualSeconds = relevant.reduce((sum, record) => sum + record.actualSeconds, 0)

  const focusSessions = relevant.filter((record) => record.mode === 'focus')
  const focusActualSeconds = focusSessions.reduce((sum, record) => sum + record.actualSeconds, 0)
  const deepFocusSessions = focusSessions.filter(
    (record) => record.completed && record.actualSeconds >= 45 * 60,
  ).length
  const unfinishedSessions = totalSessions - completedSessions
  const unfinishedSeconds = Math.max(0, totalPlannedSeconds - totalActualSeconds)

  const averageCompletion =
    totalSessions === 0
      ? 0
      : relevant.reduce((sum, record) => sum + clampNumber(record.completionRatio, 0, 1), 0) /
        totalSessions

  const activeDays = getActiveDays(relevant)
  const streakDays = getStreakDays(focusSessions)

  const consistencyRate =
    dayWindow && dayWindow > 0 ? clampNumber(activeDays / dayWindow, 0, 1) : clampNumber(completionRate, 0, 1)

  const deepFocusRate =
    focusSessions.length === 0 ? 0 : clampNumber(deepFocusSessions / focusSessions.length, 0, 1)
  const streakMomentum = 1 - Math.exp(-streakDays / 6)
  const unfinishedRatio =
    totalPlannedSeconds > 0 ? clampNumber(unfinishedSeconds / totalPlannedSeconds, 0, 1) : 0

  const baseMomentum = clampNumber(
    completionRate * 0.35 +
      averageCompletion * 0.25 +
      consistencyRate * 0.2 +
      streakMomentum * 0.13 +
      deepFocusRate * 0.07,
    0,
    1,
  )

  const interruptionPenalty = Math.pow(unfinishedRatio, 0.7) * 0.32
  const adjustedMomentum = clampNumber(baseMomentum - interruptionPenalty, 0, 1)
  const finishPressureScore = toSaturatingScore(adjustedMomentum)

  return {
    windowDays: dayWindow,
    totalSessions,
    completedSessions,
    unfinishedSessions,
    completionRate,
    averageCompletion,
    totalPlannedSeconds,
    totalActualSeconds,
    focusActualSeconds,
    deepFocusSessions,
    unfinishedSeconds,
    activeDays,
    streakDays,
    finishPressureScore,
  }
}

const getActiveDays = (records) => {
  const active = new Set()
  for (const record of records) {
    const timestamp = Date.parse(record.endedAt)
    if (!Number.isFinite(timestamp)) continue
    active.add(new Date(timestamp).toISOString().slice(0, 10))
  }
  return active.size
}

const getStreakDays = (focusRecords) => {
  const days = new Set(
    focusRecords
      .filter((record) => record.completed)
      .map((record) => {
        const timestamp = Date.parse(record.endedAt)
        if (!Number.isFinite(timestamp)) return null
        return new Date(timestamp).toISOString().slice(0, 10)
      })
      .filter(Boolean),
  )

  if (!days.size) return 0

  let streak = 0
  const cursor = new Date()

  while (true) {
    const day = cursor.toISOString().slice(0, 10)
    if (days.has(day)) {
      streak += 1
      cursor.setUTCDate(cursor.getUTCDate() - 1)
      continue
    }

    if (streak === 0) {
      cursor.setUTCDate(cursor.getUTCDate() - 1)
      const previousDay = cursor.toISOString().slice(0, 10)
      if (days.has(previousDay)) {
        streak += 1
        cursor.setUTCDate(cursor.getUTCDate() - 1)
        continue
      }
    }

    break
  }

  return streak
}

const parseCsvLine = (line) => {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (char === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += char
  }

  values.push(current)
  return values
}

const escapeCsv = (value) => {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const parseSafeNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max)

const toSaturatingScore = (normalizedValue) => {
  const bounded = clampNumber(normalizedValue, 0, 1)
  const curve = 4.5
  const saturated = (1 - Math.exp(-curve * bounded)) / (1 - Math.exp(-curve))
  return Math.round(clampNumber(saturated, 0, 1) * 100)
}

const toIso = (value) => {
  const parsed = Date.parse(value)
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString()
  }
  return new Date().toISOString()
}

const normalizeMode = (value) => {
  if (value === 'focus' || value === 'shortBreak' || value === 'longBreak') {
    return value
  }
  return 'focus'
}

const normalizeReason = (reason) => {
  const valid = new Set(['completed', 'skipped', 'reset', 'reconfigured', 'abandoned'])
  if (valid.has(reason)) return reason
  return 'abandoned'
}

module.exports = {
  AnalyticsStore,
}
