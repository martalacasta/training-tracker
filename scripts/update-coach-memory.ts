import { buildCoachState } from './lib/coach'
import { readDataFile, writeDataFile } from './lib/json'
import { defaultGoalsData, type ActivitiesData, type GoalsData } from './lib/types'

const emptyActivities: ActivitiesData = {
  updatedAt: new Date(0).toISOString(),
  items: [],
}

async function main() {
  const activities = await readDataFile<ActivitiesData>('activities.json', emptyActivities)
  const goals = await readDataFile<GoalsData>('goals.json', defaultGoalsData)
  const coachState = buildCoachState(activities, goals)

  await writeDataFile('coach-state.json', coachState)
  console.log('Coach state updated.')
}

await main()
