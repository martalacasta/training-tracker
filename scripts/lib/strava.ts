import { z } from 'zod'
import { stravaActivitySchema, type Activity, type StravaActivity } from './types'

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
})

const STRAVA_RETRY_MAX = Number(process.env.STRAVA_RETRY_MAX ?? 4)
const STRAVA_RETRY_BASE_MS = Number(process.env.STRAVA_RETRY_BASE_MS ?? 1500)

class StravaRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StravaRateLimitError'
  }
}

export async function refreshStravaToken(): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: number
}> {
  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, or STRAVA_REFRESH_TOKEN in environment.',
    )
  }

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    throw new Error(`Could not refresh Strava token. Status ${response.status}`)
  }

  const parsed = tokenResponseSchema.parse(await response.json())

  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresAt: parsed.expires_at,
  }
}

export async function fetchRecentStravaActivities(
  accessToken: string,
  afterEpochSeconds: number,
): Promise<Activity[]> {
  const activities: StravaActivity[] = []
  let page = 1
  let hasMore = true

  while (hasMore && page <= 10) {
    const url = new URL('https://www.strava.com/api/v3/athlete/activities')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))
    url.searchParams.set('after', String(afterEpochSeconds))

    const response = await fetchWithRetry(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      throw new Error(`Could not fetch Strava activities. Status ${response.status}`)
    }

    const pageItems = z.array(stravaActivitySchema).parse(await response.json())
    activities.push(...pageItems)
    hasMore = pageItems.length === 100
    page += 1
  }

  const detailFetchedAt = new Date().toISOString()
  const detailed: Array<{ activity: StravaActivity; detailFetched: boolean }> = []
  const concurrency = 4
  let stopDetailFetchDueToRateLimit = false
  for (let index = 0; index < activities.length; index += concurrency) {
    const batch = activities.slice(index, index + concurrency)
    const results = await Promise.all(
      batch.map(async (activity) => {
        if (stopDetailFetchDueToRateLimit) {
          return { activity, detailFetched: false }
        }

        try {
          const detail = await fetchStravaActivityDetail(accessToken, activity.id)
          return { activity: detail ?? activity, detailFetched: true }
        } catch (error) {
          if (isStravaRateLimitError(error)) {
            stopDetailFetchDueToRateLimit = true
            return { activity, detailFetched: false }
          }
          throw error
        }
      }),
    )
    detailed.push(...results)
  }

  return detailed.map(({ activity, detailFetched }) =>
    normalizeStravaActivity(activity, {
      detailFetched,
      detailFetchedAt: detailFetched ? detailFetchedAt : null,
    }),
  )
}

// The list endpoint omits `description` and `calories`; fetch the detail endpoint to get them.
export async function fetchStravaActivityDetail(
  accessToken: string,
  activityId: number,
): Promise<StravaActivity | null> {
  const response = await fetchWithRetry(
    `https://www.strava.com/api/v3/activities/${activityId}?include_all_efforts=false`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(
      `Could not fetch Strava activity ${activityId}. Status ${response.status}`,
    )
  }

  return stravaActivitySchema.parse(await response.json())
}

async function fetchWithRetry(input: string | URL, init: RequestInit): Promise<Response> {
  const attempts = Math.max(0, STRAVA_RETRY_MAX) + 1

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(input, init)
    if (response.ok || response.status === 404) {
      return response
    }

    const shouldRetry = response.status === 429 || response.status >= 500
    const hasAttemptsLeft = attempt + 1 < attempts
    if (!shouldRetry || !hasAttemptsLeft) {
      if (response.status === 429) {
        throw new StravaRateLimitError(
          `Strava rate limit reached (status 429) after ${attempt + 1} attempts.`,
        )
      }
      return response
    }

    const retryAfter = getRetryAfterMilliseconds(response)
    const backoff = STRAVA_RETRY_BASE_MS * 2 ** attempt
    await sleep(Math.max(retryAfter, backoff))
  }

  throw new Error('Unexpected Strava retry state')
}

function getRetryAfterMilliseconds(response: Response): number {
  const header = response.headers.get('retry-after')
  if (!header) {
    return 0
  }

  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }

  return 0
}

function isStravaRateLimitError(error: unknown): error is StravaRateLimitError {
  return error instanceof StravaRateLimitError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeStravaActivity(
  activity: StravaActivity,
  options?: { detailFetched?: boolean; detailFetchedAt?: string | null },
): Activity {
  const runLike = activity.sport_type === 'Run'
  const averageRhythm = runLike ? getAverageRhythm(activity) : null

  return {
    id: String(activity.id),
    sportType: activity.sport_type,
    startDate: activity.start_date,
    title: activity.name,
    description: activity.description ?? null,
    distanceKm: round(activity.distance / 1000),
    movingTimeSeconds: activity.moving_time,
    calories: activity.calories ?? null,
    averageRhythm,
    averageHeartRate: activity.average_heartrate ?? null,
    sensation: null,
    detailsBackfillDone: options?.detailFetched === true,
    detailsFetchAttempts: options?.detailFetched ? 1 : 0,
    detailsFetchedAt: options?.detailFetchedAt ?? null,
  }
}

function getAverageRhythm(activity: StravaActivity): number | null {
  if (typeof activity.average_speed === 'number' && activity.average_speed > 0) {
    const secondsPerKm = 1000 / activity.average_speed
    return round(secondsPerKm / 60)
  }

  if (activity.distance > 0) {
    const secondsPerKm = activity.moving_time / (activity.distance / 1000)
    return round(secondsPerKm / 60)
  }

  return null
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
