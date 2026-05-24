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
}

export type Goal = {
  id: string
  name: string
  targetDate: string
  status: 'on-track' | 'at-risk' | 'completed'
  type: 'race' | 'volume' | 'consistency'
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

export const defaultActivitiesData: ActivitiesData = {
  updatedAt: new Date(0).toISOString(),
  items: [],
}

export const defaultAggregatesData: AggregatesData = {
  updatedAt: new Date(0).toISOString(),
  weeks: [],
  months: [],
}

export const defaultGoalsData: GoalsData = {
  updatedAt: new Date(0).toISOString(),
  items: [],
}

export const defaultCoachStateData: CoachStateData = {
  updatedAt: new Date(0).toISOString(),
  state: {
    trainingPhase: 'base',
    adherence: 0,
    fatigueFlags: [],
  },
}

export const defaultRecommendationsData: RecommendationsData = {
  updatedAt: new Date(0).toISOString(),
  items: [],
}

export const defaultInsightsData: InsightsData = {
  updatedAt: new Date(0).toISOString(),
  summary: 'No insights yet.',
}

export async function fetchDataFile<T>(fileName: string): Promise<T | null> {
  const response = await fetch(`./data/${fileName}`, { cache: 'no-store' })
  if (!response.ok) {
    return null
  }

  return (await response.json()) as T
}
