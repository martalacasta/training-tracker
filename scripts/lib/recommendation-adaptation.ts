import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import type {
  Activity,
  Goal,
  Recommendation,
  RecommendationAdaptationTrace,
  WeeklyPlanComparison,
} from './types'

dayjs.extend(isoWeek)

const DEFAULT_TARGET_SESSIONS = 4

export function buildWeeklyPlanComparison(
  goals: Goal[],
  recommendations: Recommendation[],
  activities: Activity[],
  now: Date = new Date(),
): WeeklyPlanComparison {
  const nowDate = dayjs(now)
  const isoWeekKey = `${nowDate.isoWeekYear()}-W${String(nowDate.isoWeek()).padStart(2, '0')}`
  const activeGoal = goals.find((goal) => goal.status !== 'completed')

  const targetSessions = activeGoal?.targetSessionsPerWeek ?? DEFAULT_TARGET_SESSIONS
  const plannedSessions = computePlannedSessions(recommendations)
  const completedSessions = activities.filter((activity) => isInIsoWeek(activity.startDate, isoWeekKey)).length

  return {
    isoWeek: isoWeekKey,
    targetSessions,
    plannedSessions,
    completedSessions,
    remainingSessions: Math.max(plannedSessions - completedSessions, 0),
  }
}

export function compareRecommendations(
  previous: Recommendation[],
  current: Recommendation[],
): RecommendationAdaptationTrace {
  const previousById = new Map(previous.map((item) => [item.id, item]))
  const currentById = new Map(current.map((item) => [item.id, item]))

  const addedRecommendationIds = current
    .filter((item) => !previousById.has(item.id))
    .map((item) => item.id)
  const removedRecommendationIds = previous
    .filter((item) => !currentById.has(item.id))
    .map((item) => item.id)
  const updatedRecommendationIds = current
    .filter((item) => {
      const previousVersion = previousById.get(item.id)
      return previousVersion ? fingerprintRecommendation(previousVersion) !== fingerprintRecommendation(item) : false
    })
    .map((item) => item.id)

  return {
    previousRunId: null,
    changed:
      addedRecommendationIds.length > 0 ||
      removedRecommendationIds.length > 0 ||
      updatedRecommendationIds.length > 0,
    addedRecommendationIds,
    removedRecommendationIds,
    updatedRecommendationIds,
  }
}

export function computePlannedSessions(recommendations: Recommendation[]): number {
  return recommendations.reduce((total, recommendation) => {
    const plannedSessions = recommendation.metadata?.plannedSessions ?? 1
    if (!Number.isFinite(plannedSessions)) {
      return total + 1
    }

    return total + Math.max(0, Math.round(plannedSessions))
  }, 0)
}

function isInIsoWeek(startDate: string, isoWeekKey: string): boolean {
  const date = dayjs(startDate)
  const activityIsoWeek = `${date.isoWeekYear()}-W${String(date.isoWeek()).padStart(2, '0')}`
  return activityIsoWeek === isoWeekKey
}

function fingerprintRecommendation(item: Recommendation): string {
  return JSON.stringify({
    title: item.title,
    description: item.description,
    intensity: item.intensity,
    confidence: item.confidence,
    plannedSessions: item.metadata?.plannedSessions ?? 1,
    rationaleTags: (item.metadata?.rationaleTags ?? []).slice().sort(),
  })
}
