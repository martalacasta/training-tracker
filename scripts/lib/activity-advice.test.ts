import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACTIVITY_ADVICE_SCHEMA_VERSION,
  computeActivityAdviceVersions,
  isActivityAdviceStale,
  normalizeActivityAdviceResponse,
  type ActivityAdviceData,
} from './activity-advice'
import type { Activity, CoachStateData, Goal } from './types'

const baseActivity: Activity = {
  id: 'activity-1',
  sportType: 'Run',
  startDate: '2026-05-20T10:00:00Z',
  title: 'Morning Run',
  description: 'Easy run',
  distanceKm: 10,
  movingTimeSeconds: 3600,
  calories: 700,
  averageRhythm: 6,
  averageHeartRate: 145,
  sensation: null,
}

const baseCoachState: CoachStateData = {
  updatedAt: '2026-05-20T11:00:00Z',
  state: {
    trainingPhase: 'base',
    adherence: 0.7,
    fatigueFlags: [],
  },
}

const baseGoals: Goal[] = [
  {
    id: 'goal-1',
    name: 'Half Marathon',
    targetDate: '2026-10-01',
    type: 'race',
    status: 'on-track',
    targetSessionsPerWeek: 4,
  },
]

test('computeActivityAdviceVersions changes when activity changes', () => {
  const baseline = computeActivityAdviceVersions(baseActivity, baseCoachState, baseGoals)
  const changed = computeActivityAdviceVersions(
    { ...baseActivity, distanceKm: baseActivity.distanceKm + 1 },
    baseCoachState,
    baseGoals,
  )

  assert.notEqual(baseline.activity, changed.activity)
  assert.equal(baseline.context, changed.context)
})

test('isActivityAdviceStale returns false for matching versions', () => {
  const versions = computeActivityAdviceVersions(baseActivity, baseCoachState, baseGoals)
  const existing: ActivityAdviceData = {
    schemaVersion: ACTIVITY_ADVICE_SCHEMA_VERSION,
    activityId: baseActivity.id,
    generatedAt: '2026-05-21T10:00:00Z',
    source: 'llm',
    model: 'gpt-4.1',
    versions,
    advice: {
      summary: 'summary',
      focus: 'focus',
      nextSession: 'next',
      caution: null,
    },
  }

  assert.equal(isActivityAdviceStale(existing, versions, baseActivity.id), false)
})

test('isActivityAdviceStale returns true for schema mismatch', () => {
  const versions = computeActivityAdviceVersions(baseActivity, baseCoachState, baseGoals)
  const existing: ActivityAdviceData = {
    schemaVersion: ACTIVITY_ADVICE_SCHEMA_VERSION + 1,
    activityId: baseActivity.id,
    generatedAt: '2026-05-21T10:00:00Z',
    source: 'llm',
    model: 'gpt-4.1',
    versions,
    advice: {
      summary: 'summary',
      focus: 'focus',
      nextSession: 'next',
      caution: null,
    },
  }

  assert.equal(isActivityAdviceStale(existing, versions, baseActivity.id), true)
})

test('normalizeActivityAdviceResponse trims and normalizes caution', () => {
  const normalized = normalizeActivityAdviceResponse({
    summary: '  Keep easy pace  ',
    focus: '  Recovery  ',
    nextSession: '  40 min easy run  ',
    caution: '   ',
  })

  assert.deepEqual(normalized, {
    summary: 'Keep easy pace',
    focus: 'Recovery',
    nextSession: '40 min easy run',
    caution: null,
  })
})
