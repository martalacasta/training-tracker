import { readDataFile, readRuntimeState, writeDataFile, writeRuntimeState } from './lib/json'
import { computeAggregates } from './lib/metrics'
import { fetchRecentStravaActivities, refreshStravaToken } from './lib/strava'
import { defaultGoalsData, type ActivitiesData } from './lib/types'

type SyncState = {
  lastSyncEpochSeconds: number
}

const defaultActivities: ActivitiesData = {
  updatedAt: new Date(0).toISOString(),
  items: [],
}

async function main() {
  const existing = await readDataFile<ActivitiesData>('activities.json', defaultActivities)
  const syncState = await readRuntimeState<SyncState>('sync-state.json', {
    lastSyncEpochSeconds: 0,
  })

  const { accessToken } = await refreshStravaToken()
  const latestActivities = await fetchRecentStravaActivities(accessToken, syncState.lastSyncEpochSeconds)

  const mergedById = new Map(existing.items.map((item) => [item.id, item]))
  for (const activity of latestActivities) {
    mergedById.set(activity.id, activity)
  }

  const merged = [...mergedById.values()].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const nowEpoch = Math.floor(Date.now() / 1000)

  const updatedActivities: ActivitiesData = {
    updatedAt: new Date().toISOString(),
    items: merged,
  }

  await writeDataFile('activities.json', updatedActivities)
  await writeDataFile('aggregates.json', computeAggregates(merged))
  await writeDataFile('goals.json', await readDataFile('goals.json', defaultGoalsData))
  await writeRuntimeState('sync-state.json', { lastSyncEpochSeconds: nowEpoch })

  console.log(`Synced ${latestActivities.length} activities. Total activities: ${merged.length}.`)
}

await main()
