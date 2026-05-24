import assert from 'node:assert/strict'
import test from 'node:test'
import {
  selectActivityAdviceCandidates,
  type ActivityAdviceSelectionConfig,
} from './activity-advice-selection'
import { ACTIVITY_ADVICE_SCHEMA_VERSION, type ActivityAdviceData } from './activity-advice'
import type { Activity, CoachStateData, Goal } from './types'

const baseCoachState: CoachStateData = {
  updatedAt: '2026-05-24T10:00:00Z',
  state: { trainingPhase: 'build', adherence: 0.8, fatigueFlags: [] },
}

const baseGoals: Goal[] = [
  {
    id: 'half',
    name: 'Half Marathon',
    targetDate: '2026-11-01',
    type: 'race',
    status: 'on-track',
    targetSessionsPerWeek: 4,
  },
]

function makeActivity(id: string, startDate: string): Activity {
  return {
    id,
    sportType: 'Run',
    startDate,
    title: `Run ${id}`,
    description: null,
    distanceKm: 5,
    movingTimeSeconds: 1800,
    calories: null,
    averageRhythm: 6,
    averageHeartRate: 145,
    sensation: null,
  }
}

function makeAdvice(activityId: string): ActivityAdviceData {
  return {
    schemaVersion: ACTIVITY_ADVICE_SCHEMA_VERSION,
    activityId,
    generatedAt: '2026-05-24T11:00:00Z',
    source: 'llm',
    model: 'openai/gpt-4.1-mini',
    versions: { activity: 'old', context: 'old' },
    advice: {
      summary: 'old summary',
      focus: 'old focus',
      nextSession: 'old next',
      caution: null,
    },
  }
}

function makeConfig(overrides?: Partial<ActivityAdviceSelectionConfig>): ActivityAdviceSelectionConfig {
  return {
    lookbackDays: 7,
    regenerateStale: false,
    maxPerRun: 20,
    now: new Date('2026-05-24T12:00:00Z'),
    ...overrides,
  }
}

test('selects only activities within lookback window', () => {
  const activities = [
    makeActivity('new', '2026-05-23T10:00:00Z'),
    makeActivity('old', '2026-05-01T10:00:00Z'),
  ]

  const candidates = selectActivityAdviceCandidates(
    activities,
    baseCoachState,
    baseGoals,
    new Map(),
    makeConfig({ lookbackDays: 7 }),
  )

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.activity.id, 'new')
})

test('does not include stale entries when regenerateStale is false', () => {
  const activities = [makeActivity('a1', '2026-05-23T10:00:00Z')]
  const existing = new Map<string, ActivityAdviceData | null>([['a1', makeAdvice('a1')]])

  const candidates = selectActivityAdviceCandidates(
    activities,
    baseCoachState,
    baseGoals,
    existing,
    makeConfig({ regenerateStale: false }),
  )

  assert.equal(candidates.length, 0)
})

test('includes stale entries when regenerateStale is true', () => {
  const activities = [makeActivity('a1', '2026-05-23T10:00:00Z')]
  const existing = new Map<string, ActivityAdviceData | null>([['a1', makeAdvice('a1')]])

  const candidates = selectActivityAdviceCandidates(
    activities,
    baseCoachState,
    baseGoals,
    existing,
    makeConfig({ regenerateStale: true }),
  )

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.reason, 'stale')
})

test('caps output with maxPerRun', () => {
  const activities = [
    makeActivity('a1', '2026-05-24T09:00:00Z'),
    makeActivity('a2', '2026-05-23T09:00:00Z'),
    makeActivity('a3', '2026-05-22T09:00:00Z'),
  ]

  const candidates = selectActivityAdviceCandidates(
    activities,
    baseCoachState,
    baseGoals,
    new Map(),
    makeConfig({ maxPerRun: 2 }),
  )

  assert.equal(candidates.length, 2)
  assert.deepEqual(
    candidates.map((candidate) => candidate.activity.id),
    ['a1', 'a2'],
  )
})
