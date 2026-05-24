import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import type { Activity, AggregatesData } from './types'

dayjs.extend(isoWeek)

export function computeAggregates(activities: Activity[]): AggregatesData {
  const weekMap = new Map<
    string,
    { distanceKm: number; movingTimeHours: number; sessions: number; heartRates: number[] }
  >()
  const monthMap = new Map<string, { distanceKm: number; movingTimeHours: number; sessions: number }>()

  for (const activity of activities) {
    const date = dayjs(activity.startDate)
    const weekKey = `${date.isoWeekYear()}-W${String(date.isoWeek()).padStart(2, '0')}`
    const monthKey = date.format('YYYY-MM')

    const week = weekMap.get(weekKey) ?? {
      distanceKm: 0,
      movingTimeHours: 0,
      sessions: 0,
      heartRates: [],
    }
    week.distanceKm += activity.distanceKm
    week.movingTimeHours += activity.movingTimeSeconds / 3600
    week.sessions += 1
    if (activity.averageHeartRate) {
      week.heartRates.push(activity.averageHeartRate)
    }
    weekMap.set(weekKey, week)

    const month = monthMap.get(monthKey) ?? { distanceKm: 0, movingTimeHours: 0, sessions: 0 }
    month.distanceKm += activity.distanceKm
    month.movingTimeHours += activity.movingTimeSeconds / 3600
    month.sessions += 1
    monthMap.set(monthKey, month)
  }

  return {
    updatedAt: new Date().toISOString(),
    weeks: [...weekMap.entries()]
      .map(([isoWeek, value]) => ({
        isoWeek,
        distanceKm: round(value.distanceKm),
        movingTimeHours: round(value.movingTimeHours),
        sessions: value.sessions,
        avgHeartRate:
          value.heartRates.length > 0
            ? round(value.heartRates.reduce((acc, hr) => acc + hr, 0) / value.heartRates.length)
            : null,
      }))
      .sort((a, b) => a.isoWeek.localeCompare(b.isoWeek)),
    months: [...monthMap.entries()]
      .map(([month, value]) => ({
        month,
        distanceKm: round(value.distanceKm),
        movingTimeHours: round(value.movingTimeHours),
        sessions: value.sessions,
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
