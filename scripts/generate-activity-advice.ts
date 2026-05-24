import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readDataFile } from './lib/json'
import { maybeGenerateJsonWithLlm, resolveLlmConfig } from './lib/llm'
import { DATA_DIR } from './lib/paths'
import type { ActivitiesData, AthleteProfileData, CoachStateData, GoalsData } from './lib/types'
import {
  ACTIVITY_ADVICE_SCHEMA_VERSION,
  normalizeActivityAdviceResponse,
  type ActivityAdviceData,
  type ActivityAdviceLlmResponse,
} from './lib/activity-advice'
import { selectActivityAdviceCandidates } from './lib/activity-advice-selection'

const emptyActivities: ActivitiesData = {
  updatedAt: new Date(0).toISOString(),
  items: [],
}

const emptyCoachState: CoachStateData = {
  updatedAt: new Date(0).toISOString(),
  state: { trainingPhase: 'base', adherence: 0, fatigueFlags: [] },
}

const emptyGoals: GoalsData = {
  updatedAt: new Date(0).toISOString(),
  items: [],
}

const defaultAthleteProfile: AthleteProfileData = {
  updatedAt: new Date(0).toISOString(),
  summary: '',
  trainingDaysPerWeek: null,
  preferredSessionStyle: null,
  background: null,
  constraints: null,
}

async function main() {
  const lookbackDays = Number(process.env.ACTIVITY_ADVICE_LOOKBACK_DAYS ?? 7)
  const regenerateStale = parseBooleanEnv(process.env.ACTIVITY_ADVICE_REGENERATE_STALE, false)
  const maxPerRun = Number(process.env.ACTIVITY_ADVICE_MAX_PER_RUN ?? 20)
  const recentContextLimit = Number(process.env.ACTIVITY_ADVICE_CONTEXT_LIMIT ?? 8)

  const activities = await readDataFile<ActivitiesData>('activities.json', emptyActivities)
  const coachState = await readDataFile<CoachStateData>('coach-state.json', emptyCoachState)
  const goals = await readDataFile<GoalsData>('goals.json', emptyGoals)
  const athleteProfile = await readDataFile<AthleteProfileData>('athlete-profile.json', defaultAthleteProfile)
  const sortedActivities = activities.items
    .slice()
    .sort((a, b) => b.startDate.localeCompare(a.startDate))

  const adviceDir = join(DATA_DIR, 'activity-advice')
  await mkdir(adviceDir, { recursive: true })

  const existingByActivityId = new Map<string, ActivityAdviceData | null>()
  for (const activity of sortedActivities) {
    const outputPath = join(adviceDir, `${activity.id}.json`)
    const existing = await readActivityAdviceFile(outputPath)
    existingByActivityId.set(activity.id, existing)
  }

  const now = new Date()
  const candidates = selectActivityAdviceCandidates(
    sortedActivities,
    coachState,
    goals.items,
    existingByActivityId,
    { lookbackDays, regenerateStale, maxPerRun, now },
  )

  if (candidates.length === 0) {
    console.log('No activity advice candidates in current window/config.')
    return
  }

  const llmConfig = resolveLlmConfig()
  if (!llmConfig) {
    const missingCount = candidates.filter((candidate) => candidate.reason === 'missing').length
    const staleCount = candidates.length - missingCount
    console.log(
      `Skipped activity advice generation because no LLM config was found (${missingCount} missing, ${staleCount} stale).`,
    )
    return
  }

  const historicalContext = buildHistoricalContext(sortedActivities, now)
  let updatedCount = 0
  for (const candidate of candidates) {
    const contextActivities = sortedActivities
      .filter((item) => item.id !== candidate.activity.id)
      .slice(0, Math.max(1, recentContextLimit))
    const response = await maybeGenerateJsonWithLlm<ActivityAdviceLlmResponse>({
      config: llmConfig,
      systemPrompt:
        'You are an endurance training coach. Return only valid JSON with keys summary, focus, nextSession, and optional caution.',
      userPrompt: JSON.stringify(
        {
          activity: candidate.activity,
          athleteProfile,
          coachState: coachState.state,
          goals: goals.items,
          historicalContext,
          recentContext: contextActivities,
          outputSchema: {
            summary: 'string (max 2 short sentences)',
            focus: 'string (single actionable focus for this athlete)',
            nextSession: 'string (concrete next workout or recovery action)',
            caution: 'string or null (risk flag to watch)',
          },
        },
        null,
        2,
      ),
      temperature: 0.2,
    })

    if (!response) {
      throw new Error('Expected LLM response while generating activity advice')
    }

    const output: ActivityAdviceData = {
      schemaVersion: ACTIVITY_ADVICE_SCHEMA_VERSION,
      activityId: candidate.activity.id,
      generatedAt: new Date().toISOString(),
      source: 'llm',
      model: llmConfig.model,
      versions: candidate.versions,
      advice: normalizeActivityAdviceResponse(response),
    }

    await writeFile(join(adviceDir, `${candidate.activity.id}.json`), JSON.stringify(output, null, 2) + '\n', 'utf8')
    updatedCount += 1
  }

  const missingCount = candidates.filter((candidate) => candidate.reason === 'missing').length
  const staleCount = candidates.length - missingCount
  console.log(
    `Generated activity advice for ${updatedCount} activities (${missingCount} missing, ${staleCount} stale) with lookback=${lookbackDays}d maxPerRun=${maxPerRun} regenerateStale=${regenerateStale}.`,
  )
}

async function readActivityAdviceFile(path: string): Promise<ActivityAdviceData | null> {
  try {
    const content = await readFile(path, 'utf8')
    return JSON.parse(content) as ActivityAdviceData
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    ) {
      return null
    }

    throw new Error(`Could not read activity advice file ${path}: ${String(error)}`, { cause: error })
  }
}

function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === '') {
    return fallback
  }

  const value = raw.trim().toLowerCase()
  if (value === 'true' || value === '1' || value === 'yes') {
    return true
  }

  if (value === 'false' || value === '0' || value === 'no') {
    return false
  }

  return fallback
}

function buildHistoricalContext(activities: ActivitiesData['items'], now: Date) {
  const totalDistanceKm = activities.reduce((sum, activity) => sum + activity.distanceKm, 0)
  const totalMovingHours =
    activities.reduce((sum, activity) => sum + activity.movingTimeSeconds, 0) / 3600
  const sportCounts = Object.fromEntries(
    Object.entries(
      activities.reduce<Record<string, number>>((acc, activity) => {
        acc[activity.sportType] = (acc[activity.sportType] ?? 0) + 1
        return acc
      }, {}),
    ).sort((a, b) => b[1] - a[1]),
  )
  const recent30DaysCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000
  const recent30DaySessions = activities.filter((activity) => {
    const timestamp = Date.parse(activity.startDate)
    return Number.isFinite(timestamp) && timestamp >= recent30DaysCutoff
  }).length

  return {
    totalActivities: activities.length,
    totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
    totalMovingHours: Math.round(totalMovingHours * 100) / 100,
    sportCounts,
    recent30DaySessions,
  }
}

await main()
