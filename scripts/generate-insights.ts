import { readDataFile, writeDataFile } from './lib/json'
import type { ActivitiesData, CoachStateData, InsightsData } from './lib/types'

const emptyActivities: ActivitiesData = {
  updatedAt: new Date(0).toISOString(),
  items: [],
}

const emptyCoachState: CoachStateData = {
  updatedAt: new Date(0).toISOString(),
  state: { trainingPhase: 'base', adherence: 0, fatigueFlags: [] },
}

async function main() {
  const activities = await readDataFile<ActivitiesData>('activities.json', emptyActivities)
  const coachState = await readDataFile<CoachStateData>('coach-state.json', emptyCoachState)

  const totalDistance = activities.items.reduce((acc, activity) => acc + activity.distanceKm, 0)
  const totalHours =
    activities.items.reduce((acc, activity) => acc + activity.movingTimeSeconds, 0) / 3600
  const summary = [
    `You have ${activities.items.length} activities logged (${totalDistance.toFixed(1)} km, ${totalHours.toFixed(1)} h total).`,
    `Current phase is "${coachState.state.trainingPhase}" with ${(coachState.state.adherence * 100).toFixed(0)}% adherence.`,
    coachState.state.fatigueFlags.length > 0
      ? `Watch fatigue flags: ${coachState.state.fatigueFlags.join(', ')}.`
      : 'No fatigue flags detected in the latest update.',
  ].join(' ')

  const insights: InsightsData = {
    updatedAt: new Date().toISOString(),
    summary,
  }
  await writeDataFile('insights.json', insights)
  console.log('Insights generated.')
}

await main()
