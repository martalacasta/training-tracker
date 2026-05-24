import dayjs from 'dayjs'
import type { ActivitiesData, CoachStateData, GoalsData } from './types'

export function buildCoachState(activities: ActivitiesData, goals: GoalsData): CoachStateData {
  const now = dayjs()
  const inLast7Days = activities.items.filter((activity) =>
    dayjs(activity.startDate).isAfter(now.subtract(7, 'day')),
  )
  const inLast28Days = activities.items.filter((activity) =>
    dayjs(activity.startDate).isAfter(now.subtract(28, 'day')),
  )

  const weeklyDistance = inLast7Days.reduce((acc, activity) => acc + activity.distanceKm, 0)
  const baselineDistance = inLast28Days.reduce((acc, activity) => acc + activity.distanceKm, 0) / 4 || 0

  const activeGoal = goals.items.find((goal) => goal.status !== 'completed')
  const targetSessions = activeGoal?.targetSessionsPerWeek ?? 4
  const adherence = clamp(inLast7Days.length / targetSessions, 0, 1)

  const fatigueFlags: string[] = []
  if (baselineDistance > 0 && weeklyDistance > baselineDistance * 1.25) {
    fatigueFlags.push('acute-load-spike')
  }
  if (adherence < 0.5) {
    fatigueFlags.push('low-adherence')
  }

  return {
    updatedAt: new Date().toISOString(),
    state: {
      trainingPhase: getTrainingPhase(activeGoal?.targetDate),
      adherence: round(adherence),
      fatigueFlags,
    },
  }
}

function getTrainingPhase(targetDate?: string): string {
  if (!targetDate) {
    return 'base'
  }

  const weeksToTarget = dayjs(targetDate).diff(dayjs(), 'week')
  if (weeksToTarget > 16) {
    return 'base'
  }
  if (weeksToTarget > 8) {
    return 'build'
  }
  if (weeksToTarget > 2) {
    return 'specific'
  }
  if (weeksToTarget >= 0) {
    return 'taper'
  }
  return 'transition'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
