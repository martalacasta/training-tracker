import { z } from 'zod'
import { stravaActivitySchema, type Activity, type StravaActivity } from './types'

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
})

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

    const response = await fetch(url, {
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

  return activities.map(normalizeStravaActivity)
}

function normalizeStravaActivity(activity: StravaActivity): Activity {
  return {
    id: String(activity.id),
    sportType: activity.sport_type,
    startDate: activity.start_date,
    distanceKm: round(activity.distance / 1000),
    movingTimeSeconds: activity.moving_time,
    averageHeartRate: activity.average_heartrate ?? null,
    sensation: null,
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
