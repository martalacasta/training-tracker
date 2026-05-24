// One-off backfill for activities synced before description/calories were fetched
// from the Strava detail endpoint. Iterates activities.json, fetches detail for
// any item missing description or calories, sleeps on 429, and commits progress
// after every successful detail call so a re-run can resume.

import { readDataFile, writeDataFile } from './lib/json'
import { getBackfillQueue } from './lib/backfill'
import { fetchStravaActivityDetail, refreshStravaToken } from './lib/strava'
import type { ActivitiesData, Activity } from './lib/types'

const defaultActivities: ActivitiesData = {
  updatedAt: new Date(0).toISOString(),
  items: [],
}

const MAX_PER_RUN = Number(process.env.BACKFILL_MAX ?? 250)
const DELAY_BETWEEN_REQUESTS_MS = Number(process.env.BACKFILL_DELAY_MS ?? 200)
const RATE_LIMIT_BACKOFF_MS = 16 * 60 * 1000

async function main() {
  const activities = await readDataFile<ActivitiesData>('activities.json', defaultActivities)
  const needsBackfill = getBackfillQueue(activities.items)

  if (needsBackfill.length === 0) {
    console.log('Nothing to backfill.')
    return
  }

  console.log(
    `Backfilling up to ${Math.min(MAX_PER_RUN, needsBackfill.length)} of ${needsBackfill.length} activities pending details fetch.`,
  )

  const { accessToken } = await refreshStravaToken()
  const byId = new Map<string, Activity>(activities.items.map((item) => [item.id, item]))

  let processed = 0
  for (const id of needsBackfill.slice(0, MAX_PER_RUN)) {
    const existing = byId.get(id)
    if (!existing) {
      continue
    }

    const numericId = Number(id)
    if (!Number.isFinite(numericId)) {
      markBackfillAttempt(existing, true)
      byId.set(id, existing)
      processed += 1
      continue
    }

    try {
      const detail = await fetchStravaActivityDetail(accessToken, numericId)
      const merged = {
        ...existing,
        description: detail?.description ?? existing.description ?? null,
        calories: detail?.calories ?? existing.calories ?? null,
      }
      markBackfillAttempt(merged, true)
      byId.set(id, merged)
      processed += 1

      if (processed % 10 === 0) {
        await persist(activities, byId)
        console.log(`  ...persisted ${processed} updates`)
      }

      await sleep(DELAY_BETWEEN_REQUESTS_MS)
    } catch (error) {
      const message = String(error)
      if (isStravaRateLimit(error, message)) {
        console.warn('Hit Strava rate limit. Persisting progress and waiting 16 minutes...')
        await persist(activities, byId)
        await sleep(RATE_LIMIT_BACKOFF_MS)
        continue
      }
      throw error
    }
  }

  await persist(activities, byId)
  console.log(`Backfill done. Processed ${processed} activities this run.`)
}

function markBackfillAttempt(activity: Activity, success: boolean): void {
  activity.detailsFetchAttempts = (activity.detailsFetchAttempts ?? 0) + 1
  if (success) {
    activity.detailsBackfillDone = true
    activity.detailsFetchedAt = new Date().toISOString()
  }
}

async function persist(activities: ActivitiesData, byId: Map<string, Activity>): Promise<void> {
  const merged = [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate))
  await writeDataFile('activities.json', {
    updatedAt: new Date().toISOString(),
    items: merged,
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isStravaRateLimit(error: unknown, message: string): boolean {
  const errorName =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: string }).name)
      : ''

  return errorName === 'StravaRateLimitError' || message.includes('Status 429') || message.includes('status 429')
}

await main()
