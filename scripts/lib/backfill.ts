import type { Activity } from './types'

export function shouldBackfillActivity(activity: Activity): boolean {
  return activity.detailsBackfillDone !== true
}

export function getBackfillQueue(activities: Activity[]): string[] {
  return activities
    .filter(shouldBackfillActivity)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((activity) => activity.id)
}
