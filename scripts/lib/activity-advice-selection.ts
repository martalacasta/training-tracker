import { computeActivityAdviceVersions, isActivityAdviceStale, type ActivityAdviceData } from './activity-advice'
import type { ActivitiesData, CoachStateData, Goal } from './types'

export type ActivityAdviceCandidate = {
  reason: 'missing' | 'stale'
  activity: ActivitiesData['items'][number]
  versions: { activity: string; context: string }
}

export type ActivityAdviceSelectionConfig = {
  lookbackDays: number
  regenerateStale: boolean
  maxPerRun: number
  now: Date
}

export function selectActivityAdviceCandidates(
  activities: ActivitiesData['items'],
  coachState: CoachStateData,
  goals: Goal[],
  existingByActivityId: Map<string, ActivityAdviceData | null>,
  config: ActivityAdviceSelectionConfig,
): ActivityAdviceCandidate[] {
  const thresholdTimestamp = config.now.getTime() - Math.max(0, config.lookbackDays) * 24 * 60 * 60 * 1000
  const candidates: ActivityAdviceCandidate[] = []

  for (const activity of activities) {
    const activityTimestamp = Date.parse(activity.startDate)
    if (!Number.isFinite(activityTimestamp) || activityTimestamp < thresholdTimestamp) {
      continue
    }

    const versions = computeActivityAdviceVersions(activity, coachState, goals)
    const existing = existingByActivityId.get(activity.id) ?? null

    if (!existing) {
      candidates.push({ reason: 'missing', activity, versions })
    } else if (
      config.regenerateStale &&
      isActivityAdviceStale(existing, versions, activity.id)
    ) {
      candidates.push({ reason: 'stale', activity, versions })
    }
  }

  return candidates.slice(0, Math.max(0, config.maxPerRun))
}
