import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWeeklyPlanComparison,
  compareRecommendations,
} from './recommendation-adaptation'
import type { Activity, Recommendation } from './types'

function makeActivity(id: string, startDate: string, sportType: Activity['sportType'] = 'Run'): Activity {
  return {
    id,
    sportType,
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

test('buildWeeklyPlanComparison computes run and gym progress for the current week', () => {
  const activities = [
    makeActivity('a1', '2026-05-25T08:00:00Z'),
    makeActivity('a2', '2026-05-27T08:00:00Z', 'WeightTraining'),
    makeActivity('a4', '2026-05-28T08:00:00Z', 'HighIntensityIntervalTraining'),
    makeActivity('a3', '2026-05-12T08:00:00Z'),
  ]

  const weekly = buildWeeklyPlanComparison(activities, new Date('2026-05-28T12:00:00Z'))

  assert.equal(weekly.weekStartDate, '2026-05-25')
  assert.equal(weekly.weekEndDate, '2026-05-31')
  assert.equal(weekly.runTargetSessions, 4)
  assert.equal(weekly.gymTargetSessions, 2)
  assert.equal(weekly.runCompletedSessions, 1)
  assert.equal(weekly.gymCompletedSessions, 2)
})

test('compareRecommendations detects added, removed and updated items', () => {
  const previous: Recommendation[] = [
    {
      id: 'quality',
      title: 'Quality',
      description: 'Intervals',
      intensity: 'high',
      confidence: 0.7,
    },
    {
      id: 'long',
      title: 'Long run',
      description: 'Steady run',
      intensity: 'moderate',
      confidence: 0.75,
    },
  ]
  const current: Recommendation[] = [
    {
      id: 'quality',
      title: 'Quality',
      description: 'Intervals + strides',
      intensity: 'high',
      confidence: 0.7,
    },
    {
      id: 'recovery',
      title: 'Recovery',
      description: 'Easy session',
      intensity: 'low',
      confidence: 0.85,
    },
  ]

  const adaptation = compareRecommendations(previous, current)

  assert.equal(adaptation.changed, true)
  assert.deepEqual(adaptation.addedRecommendationIds, ['recovery'])
  assert.deepEqual(adaptation.removedRecommendationIds, ['long'])
  assert.deepEqual(adaptation.updatedRecommendationIds, ['quality'])
})
