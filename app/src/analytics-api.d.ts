export type SessionMode = 'focus' | 'shortBreak' | 'longBreak'

export type SessionReason = 'completed' | 'skipped' | 'reset' | 'reconfigured' | 'abandoned'

export type SessionRecordPayload = {
  sessionId: string
  startedAt: string
  endedAt: string
  mode: SessionMode
  plannedSeconds: number
  actualSeconds: number
  completionRatio: number
  completed: boolean
  wasSkipped: boolean
  cycleIndex: number
  reason: SessionReason
}

export type AnalyticsWindowSummary = {
  windowDays: number | null
  totalSessions: number
  completedSessions: number
  unfinishedSessions: number
  completionRate: number
  averageCompletion: number
  totalPlannedSeconds: number
  totalActualSeconds: number
  focusActualSeconds: number
  deepFocusSessions: number
  unfinishedSeconds: number
  activeDays: number
  streakDays: number
  finishPressureScore: number
}

export type AnalyticsSummary = {
  lastUpdatedAt: string
  storagePath: string
  sevenDay: AnalyticsWindowSummary
  thirtyDay: AnalyticsWindowSummary
  allTime: AnalyticsWindowSummary
}

declare global {
  interface Window {
    analyticsApi?: {
      recordSession: (payload: SessionRecordPayload) => Promise<SessionRecordPayload>
      getSummary: () => Promise<AnalyticsSummary>
    }
  }
}
