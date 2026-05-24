import type { Activity, CoachStateData, Goal } from './types'

export const ACTIVITY_ADVICE_SCHEMA_VERSION = 1

export type ActivityAdviceBody = {
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
  advice: ActivityAdviceBody
}

export type ActivityAdviceLlmResponse = {
  summary: string
  focus: string
  nextSession: string
  caution?: string | null
}

export function computeActivityAdviceVersions(
  activity: Activity,
  coachState: CoachStateData,
  goals: Goal[],
): { activity: string; context: string } {
  const activityVersion = JSON.stringify({
    id: activity.id,
    sportType: activity.sportType,
    startDate: activity.startDate,
    title: activity.title ?? null,
    description: activity.description ?? null,
    distanceKm: activity.distanceKm,
    movingTimeSeconds: activity.movingTimeSeconds,
    calories: activity.calories ?? null,
    averageRhythm: activity.averageRhythm ?? null,
    averageHeartRate: activity.averageHeartRate,
    sensation: activity.sensation,
  })

  const goalsSnapshot = goals
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetDate: goal.targetDate,
      type: goal.type,
      status: goal.status,
      targetSessionsPerWeek: goal.targetSessionsPerWeek ?? null,
    }))

  const contextVersion = JSON.stringify({
    coachState: coachState.state,
    goals: goalsSnapshot,
  })

  return { activity: activityVersion, context: contextVersion }
}

export function isActivityAdviceStale(
  existing: ActivityAdviceData,
  expectedVersions: { activity: string; context: string },
  activityId: string,
): boolean {
  return (
    existing.schemaVersion !== ACTIVITY_ADVICE_SCHEMA_VERSION ||
    existing.activityId !== activityId ||
    existing.versions.activity !== expectedVersions.activity ||
    existing.versions.context !== expectedVersions.context
  )
}

export function normalizeActivityAdviceResponse(
  response: ActivityAdviceLlmResponse,
): ActivityAdviceBody {
  const summary = response.summary?.trim()
  const focus = response.focus?.trim()
  const nextSession = response.nextSession?.trim()

  if (!summary || !focus || !nextSession) {
    throw new Error('LLM activity advice response is missing required fields')
  }

  const caution = response.caution?.trim()
  return {
    summary,
    focus,
    nextSession,
    caution: caution && caution.length > 0 ? caution : null,
  }
}
