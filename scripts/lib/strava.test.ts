import assert from 'node:assert/strict'
import test from 'node:test'

type FetchFn = typeof fetch

const sampleActivity = {
  id: 12345,
  sport_type: 'Run',
  start_date: '2026-05-24T10:00:00Z',
  distance: 5000,
  moving_time: 1500,
}

test('fetchRecentStravaActivities retries list request after 429', async () => {
  const originalFetch = globalThis.fetch
  const originalRetryMax = process.env.STRAVA_RETRY_MAX
  const originalRetryBaseMs = process.env.STRAVA_RETRY_BASE_MS
  process.env.STRAVA_RETRY_MAX = '1'
  process.env.STRAVA_RETRY_BASE_MS = '0'

  try {
    const responses = [
      new Response('rate limit', { status: 429, headers: { 'retry-after': '0' } }),
      new Response(JSON.stringify([sampleActivity]), { status: 200 }),
      new Response(JSON.stringify({ ...sampleActivity, description: 'steady', calories: 320 }), {
        status: 200,
      }),
    ]

    globalThis.fetch = (async () => {
      const next = responses.shift()
      if (!next) {
        throw new Error('No mocked response left')
      }
      return next
    }) as FetchFn

    const strava = await import(`./strava.ts?retry-list-${Date.now()}`)
    const activities = await strava.fetchRecentStravaActivities('token', 0)
    assert.equal(activities.length, 1)
    assert.equal(activities[0]?.description, 'steady')
    assert.equal(activities[0]?.calories, 320)
  } finally {
    globalThis.fetch = originalFetch
    process.env.STRAVA_RETRY_MAX = originalRetryMax
    process.env.STRAVA_RETRY_BASE_MS = originalRetryBaseMs
  }
})

test('fetchRecentStravaActivities falls back to list item when detail hits 429', async () => {
  const originalFetch = globalThis.fetch
  const originalRetryMax = process.env.STRAVA_RETRY_MAX
  const originalRetryBaseMs = process.env.STRAVA_RETRY_BASE_MS
  process.env.STRAVA_RETRY_MAX = '0'
  process.env.STRAVA_RETRY_BASE_MS = '0'

  try {
    const responses = [
      new Response(JSON.stringify([sampleActivity]), { status: 200 }),
      new Response('rate limit', { status: 429, headers: { 'retry-after': '0' } }),
    ]

    globalThis.fetch = (async () => {
      const next = responses.shift()
      if (!next) {
        throw new Error('No mocked response left')
      }
      return next
    }) as FetchFn

    const strava = await import(`./strava.ts?detail-fallback-${Date.now()}`)
    const activities = await strava.fetchRecentStravaActivities('token', 0)
    assert.equal(activities.length, 1)
    assert.equal(activities[0]?.id, String(sampleActivity.id))
    assert.equal(activities[0]?.description, null)
    assert.equal(activities[0]?.calories, null)
  } finally {
    globalThis.fetch = originalFetch
    process.env.STRAVA_RETRY_MAX = originalRetryMax
    process.env.STRAVA_RETRY_BASE_MS = originalRetryBaseMs
  }
})
