import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import type {
  Activity,
  Recommendation,
  RecommendationAdaptationTrace,
  WeeklyPlanComparison,
} from './types'

dayjs.extend(isoWeek)

const RUN_TARGET_SESSIONS = 4
const GYM_TARGET_SESSIONS = 2

export function buildWeeklyPlanComparison(
  activities: Activity[],
  now: Date = new Date(),
): WeeklyPlanComparison {
  const nowDate = dayjs(now)
  const weekStartDate = nowDate.startOf('isoWeek')
  const weekEndDate = nowDate.endOf('isoWeek')
  const runCompletedSessions = activities.filter((activity) =>
    isInWeekRange(activity.startDate, weekStartDate, weekEndDate) && activity.sportType === 'Run',
  ).length
  const gymCompletedSessions = activities.filter((activity) =>
    isInWeekRange(activity.startDate, weekStartDate, weekEndDate) && isGymSportType(activity.sportType),
  ).length

  return {
    weekStartDate: weekStartDate.format('YYYY-MM-DD'),
    weekEndDate: weekEndDate.format('YYYY-MM-DD'),
    runTargetSessions: RUN_TARGET_SESSIONS,
    gymTargetSessions: GYM_TARGET_SESSIONS,
    runCompletedSessions,
    gymCompletedSessions,
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

function isInWeekRange(startDate: string, weekStartDate: dayjs.Dayjs, weekEndDate: dayjs.Dayjs): boolean {
  const date = dayjs(startDate)
  return (
    (date.isAfter(weekStartDate) || date.isSame(weekStartDate)) &&
    (date.isBefore(weekEndDate) || date.isSame(weekEndDate))
  )
}

function isGymSportType(sportType: string): boolean {
  return sportType === 'WeightTraining' || sportType === 'HighIntensityIntervalTraining'
}

function fingerprintRecommendation(item: Recommendation): string {
  return JSON.stringify({
    title: item.title,
    description: item.description,
    intensity: item.intensity,
    confidence: item.confidence,
    rationaleTags: (item.metadata?.rationaleTags ?? []).slice().sort(),
  })
}
