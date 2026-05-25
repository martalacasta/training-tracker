import { z } from 'zod'

export const stravaActivitySchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  sport_type: z.string(),
  start_date: z.string(),
  distance: z.number(),
  moving_time: z.number(),
  calories: z.number().nullable().optional(),
  average_cadence: z.number().nullable().optional(),
  average_speed: z.number().nullable().optional(),
  average_heartrate: z.number().nullable().optional(),
})

export type StravaActivity = z.infer<typeof stravaActivitySchema>

export type Activity = {
  id: string
  sportType: string
  startDate: string
  title?: string
  description?: string | null
  distanceKm: number
  movingTimeSeconds: number
  calories?: number | null
  averageRhythm?: number | null
  averageHeartRate: number | null
  sensation: string | null
  detailsBackfillDone?: boolean
  detailsFetchAttempts?: number
  detailsFetchedAt?: string | null
}

export type Goal = {
  id: string
  name: string
  targetDate: string
  type: 'race' | 'volume' | 'consistency'
  status: 'on-track' | 'at-risk' | 'completed'
  targetSessionsPerWeek?: number
  url?: string
}

export type RecommendationSource = 'rule-based' | 'llm'

export type RecommendationMetadata = {
  plannedSessions?: number
  rationaleTags?: string[]
}

export type Recommendation = {
  id: string
  title: string
  description: string
  intensity: 'low' | 'moderate' | 'high'
  confidence: number
  metadata?: RecommendationMetadata
}

export type WeeklyPlanComparison = {
  isoWeek: string
  targetSessions: number
  completedSessions: number
  remainingToTargetSessions: number
  recommendedNextSessions: number
}

export type RecommendationAdaptationTrace = {
  previousRunId: string | null
  changed: boolean
  addedRecommendationIds: string[]
  removedRecommendationIds: string[]
  updatedRecommendationIds: string[]
}

export type RecommendationTrace = {
  schemaVersion: number
  runId: string
  trigger: 'pipeline'
  source: RecommendationSource
  model: string | null
  generatedFrom: {
    activitiesUpdatedAt: string
    coachStateUpdatedAt: string
    goalsUpdatedAt: string
  }
  week: WeeklyPlanComparison
  adaptation: RecommendationAdaptationTrace
}

export type ActivitiesData = {
  updatedAt: string
  items: Activity[]
}

export type AggregatesData = {
  updatedAt: string
  weeks: Array<{
    isoWeek: string
    distanceKm: number
    movingTimeHours: number
    sessions: number
    avgHeartRate: number | null
  }>
  months: Array<{
    month: string
    distanceKm: number
    movingTimeHours: number
    sessions: number
  }>
}

export type GoalsData = {
  updatedAt: string
  items: Goal[]
}

export type CoachStateData = {
  updatedAt: string
  state: {
    trainingPhase: string
    adherence: number
    fatigueFlags: string[]
  }
}

export type RecommendationsData = {
  updatedAt: string
  items: Recommendation[]
  trace?: RecommendationTrace
}

export type InsightsData = {
  updatedAt: string
  summary: string
}

export type AthleteProfileData = {
  updatedAt: string
  summary: string
  trainingDaysPerWeek: number | null
  preferredSessionStyle: string | null
  background: string | null
  constraints: string | null
}

export type ActivityAdvice = {
  summary: string
  focus: string
  nextSession: string
  caution: string | null
}

export type ActivityAdviceData = {
  schemaVersion: number
  activityId: string
  generatedAt: string
  source: 'llm'
  model: string
  versions: {
    activity: string
    context: string
  }
  advice: ActivityAdvice
}

export const defaultGoalsData: GoalsData = {
  updatedAt: new Date().toISOString(),
  items: [
    {
      id: 'rome-half-marathon',
      name: 'Rome Half Marathon',
      targetDate: '2027-03-31',
      type: 'race',
      status: 'on-track',
      targetSessionsPerWeek: 4,
      url: 'https://www.romehalfmarathon.it',
    },
  ],
}
