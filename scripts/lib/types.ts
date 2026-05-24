import { z } from 'zod'

export const stravaActivitySchema = z.object({
  id: z.number(),
  sport_type: z.string(),
  start_date: z.string(),
  distance: z.number(),
  moving_time: z.number(),
  average_heartrate: z.number().nullable().optional(),
})

export type StravaActivity = z.infer<typeof stravaActivitySchema>

export type Activity = {
  id: string
  sportType: string
  startDate: string
  distanceKm: number
  movingTimeSeconds: number
  averageHeartRate: number | null
  sensation: string | null
}

export type Goal = {
  id: string
  name: string
  targetDate: string
  type: 'race' | 'volume' | 'consistency'
  status: 'on-track' | 'at-risk' | 'completed'
  targetSessionsPerWeek?: number
}

export type Recommendation = {
  id: string
  title: string
  description: string
  intensity: 'low' | 'moderate' | 'high'
  confidence: number
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
}

export type InsightsData = {
  updatedAt: string
  summary: string
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
    },
  ],
}
