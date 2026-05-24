import assert from 'node:assert/strict'
import test from 'node:test'
import { getBackfillQueue, shouldBackfillActivity } from './backfill'
import type { Activity } from './types'

function makeActivity(
  id: string,
  startDate: string,
  detailsBackfillDone?: boolean,
): Activity {
  return {
    id,
    sportType: 'Run',
    startDate,
    title: id,
    description: null,
    distanceKm: 5,
    movingTimeSeconds: 1800,
    calories: null,
    averageRhythm: 6,
    averageHeartRate: 140,
    sensation: null,
    detailsBackfillDone,
  }
}

test('shouldBackfillActivity skips already processed items', () => {
  assert.equal(shouldBackfillActivity(makeActivity('a', '2026-05-01T10:00:00Z', true)), false)
  assert.equal(shouldBackfillActivity(makeActivity('b', '2026-05-01T10:00:00Z', false)), true)
  assert.equal(shouldBackfillActivity(makeActivity('c', '2026-05-01T10:00:00Z')), true)
})

test('getBackfillQueue returns newest first and excludes done items', () => {
  const queue = getBackfillQueue([
    makeActivity('old', '2026-05-01T10:00:00Z'),
    makeActivity('new', '2026-05-03T10:00:00Z'),
    makeActivity('done', '2026-05-04T10:00:00Z', true),
  ])

  assert.deepEqual(queue, ['new', 'old'])
})
