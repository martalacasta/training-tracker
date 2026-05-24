import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readDataFile } from './lib/json'
import { maybeGenerateJsonWithLlm, resolveLlmConfig } from './lib/llm'
import { DATA_DIR } from './lib/paths'
import type { ActivitiesData, CoachStateData, GoalsData } from './lib/types'
import {
  ACTIVITY_ADVICE_SCHEMA_VERSION,
  computeActivityAdviceVersions,
  isActivityAdviceStale,
  normalizeActivityAdviceResponse,
  type ActivityAdviceData,
  type ActivityAdviceLlmResponse,
} from './lib/activity-advice'

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

type AdviceCandidate = {
  reason: 'missing' | 'stale'
  activity: ActivitiesData['items'][number]
  versions: { activity: string; context: string }
  outputPath: string
}

async function main() {
  const activities = await readDataFile<ActivitiesData>('activities.json', emptyActivities)
  const coachState = await readDataFile<CoachStateData>('coach-state.json', emptyCoachState)
  const goals = await readDataFile<GoalsData>('goals.json', emptyGoals)
  const sortedActivities = activities.items
    .slice()
    .sort((a, b) => b.startDate.localeCompare(a.startDate))

  const adviceDir = join(DATA_DIR, 'activity-advice')
  await mkdir(adviceDir, { recursive: true })

  const candidates: AdviceCandidate[] = []
  for (const activity of sortedActivities) {
    const outputPath = join(adviceDir, `${activity.id}.json`)
    const versions = computeActivityAdviceVersions(activity, coachState, goals.items)
    const existing = await readActivityAdviceFile(outputPath)
    if (!existing) {
      candidates.push({ reason: 'missing', activity, versions, outputPath })
      continue
    }

    if (isActivityAdviceStale(existing, versions, activity.id)) {
      candidates.push({ reason: 'stale', activity, versions, outputPath })
    }
  }

  if (candidates.length === 0) {
    console.log(`Activity advice is up to date for ${sortedActivities.length} activities.`)
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

  let updatedCount = 0
  for (const candidate of candidates) {
    const contextActivities = sortedActivities.filter((item) => item.id !== candidate.activity.id).slice(0, 8)
    const response = await maybeGenerateJsonWithLlm<ActivityAdviceLlmResponse>({
      config: llmConfig,
      systemPrompt:
        'You are an endurance training coach. Return only valid JSON with keys summary, focus, nextSession, and optional caution.',
      userPrompt: JSON.stringify(
        {
          activity: candidate.activity,
          coachState: coachState.state,
          goals: goals.items,
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

    await writeFile(candidate.outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8')
    updatedCount += 1
  }

  const missingCount = candidates.filter((candidate) => candidate.reason === 'missing').length
  const staleCount = candidates.length - missingCount
  console.log(
    `Generated activity advice for ${updatedCount} activities (${missingCount} missing, ${staleCount} stale).`,
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

await main()
