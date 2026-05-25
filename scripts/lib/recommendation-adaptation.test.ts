import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWeeklyPlanComparison,
  compareRecommendations,
  computePlannedSessions,
} from './recommendation-adaptation'
import type { Activity, Goal, Recommendation } from './types'

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

test('buildWeeklyPlanComparison computes target, done, remaining and next suggestions', () => {
  const goals: Goal[] = [
    {
      id: 'goal-1',
      name: 'Half Marathon',
      targetDate: '2026-11-01',
      type: 'race',
      status: 'on-track',
      targetSessionsPerWeek: 4,
    },
  ]
  const recommendations: Recommendation[] = [
    {
      id: 'r1',
      title: 'Quality run',
      description: 'Threshold workout.',
      intensity: 'high',
      confidence: 0.8,
      metadata: { plannedSessions: 2 },
    },
    {
      id: 'r2',
      title: 'Long run',
      description: 'Endurance session.',
      intensity: 'moderate',
      confidence: 0.75,
      metadata: { plannedSessions: 1 },
    },
    {
      id: 'r3',
      title: 'Recovery day',
      description: 'Easy mobility.',
      intensity: 'low',
      confidence: 0.9,
    },
  ]
  const activities = [
    makeActivity('a1', '2026-05-25T08:00:00Z'),
    makeActivity('a2', '2026-05-27T08:00:00Z'),
    makeActivity('a3', '2026-05-12T08:00:00Z'),
  ]

  const weekly = buildWeeklyPlanComparison(
    goals,
    recommendations,
    activities,
    new Date('2026-05-28T12:00:00Z'),
  )

  assert.equal(weekly.isoWeek, '2026-W22')
  assert.equal(weekly.targetSessions, 4)
  assert.equal(weekly.completedSessions, 2)
  assert.equal(weekly.remainingToTargetSessions, 2)
  assert.equal(weekly.recommendedNextSessions, 4)
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

test('computePlannedSessions defaults to one when metadata is absent', () => {
  const planned = computePlannedSessions([
    {
      id: 'r1',
      title: 'One',
      description: 'No metadata',
      intensity: 'moderate',
      confidence: 0.8,
    },
    {
      id: 'r2',
      title: 'Two',
      description: 'Two sessions',
      intensity: 'high',
      confidence: 0.7,
      metadata: { plannedSessions: 2 },
    },
  ])

  assert.equal(planned, 3)
})
