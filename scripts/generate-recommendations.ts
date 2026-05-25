import dayjs from 'dayjs'
import { readDataFile, writeDataFile } from './lib/json'
import { maybeGenerateRecommendationsWithLlm } from './lib/llm'
import {
  buildWeeklyPlanComparison,
  compareRecommendations,
  computePlannedSessions,
} from './lib/recommendation-adaptation'
import type {
  ActivitiesData,
  CoachStateData,
  GoalsData,
  Recommendation,
  RecommendationsData,
} from './lib/types'

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

const emptyRecommendations: RecommendationsData = {
  updatedAt: new Date(0).toISOString(),
  items: [],
}

async function main() {
  const activities = await readDataFile<ActivitiesData>('activities.json', emptyActivities)
  const coachState = await readDataFile<CoachStateData>('coach-state.json', emptyCoachState)
  const goals = await readDataFile<GoalsData>('goals.json', emptyGoals)
  const previousRecommendations = await readDataFile<RecommendationsData>(
    'next-recommendations.json',
    emptyRecommendations,
  )
  const recent = activities.items.slice().sort((a, b) => b.startDate.localeCompare(a.startDate))

  const llmResult = await maybeGenerateRecommendationsWithLlm(
    goals.items,
    coachState,
    recent,
  )
  const source = llmResult ? 'llm' : 'rule-based'
  const model = llmResult?.model ?? null
  const recommendations = normalizeRecommendations(
    llmResult?.recommendations ?? generateRuleBasedRecommendations(coachState),
  )
  const adaptation = compareRecommendations(previousRecommendations.items, recommendations)
  adaptation.previousRunId = previousRecommendations.trace?.runId ?? null
  const week = buildWeeklyPlanComparison(goals.items, recommendations, recent)
  const runId = `rec-${new Date().toISOString().replace(/[:.]/g, '-')}`

  const output: RecommendationsData = {
    updatedAt: new Date().toISOString(),
    items: recommendations,
    trace: {
      schemaVersion: 1,
      runId,
      trigger: 'pipeline',
      source,
      model,
      generatedFrom: {
        activitiesUpdatedAt: activities.updatedAt,
        coachStateUpdatedAt: coachState.updatedAt,
        goalsUpdatedAt: goals.updatedAt,
      },
      week,
      adaptation,
    },
  }
  await writeDataFile('next-recommendations.json', output)
  console.log(
    `Generated ${recommendations.length} recommendations (${source}; planned ${computePlannedSessions(recommendations)} sessions, completed ${week.completedSessions}).`,
  )
}

function generateRuleBasedRecommendations(coachState: CoachStateData): Recommendation[] {
  const recommendations: Recommendation[] = []
  const idBase = dayjs().format('YYYYMMDD')

  const hasLoadSpike = coachState.state.fatigueFlags.includes('acute-load-spike')
  const lowAdherence = coachState.state.fatigueFlags.includes('low-adherence')

  if (hasLoadSpike) {
    recommendations.push({
      id: `${idBase}-recovery`,
      title: 'Prioritize recovery day',
      description: 'Keep one complete rest or easy mobility day to absorb this week load.',
      intensity: 'low',
      confidence: 0.82,
      metadata: {
        plannedSessions: 1,
        rationaleTags: ['fatigue', 'recovery'],
      },
    })
  }

  if (lowAdherence) {
    recommendations.push({
      id: `${idBase}-consistency`,
      title: 'Rebuild consistency with shorter sessions',
      description:
        'Schedule 3 shorter sessions this week instead of one long workout to recover routine.',
      intensity: 'moderate',
      confidence: 0.78,
      metadata: {
        plannedSessions: 3,
        rationaleTags: ['adherence', 'consistency'],
      },
    })
  } else {
    recommendations.push({
      id: `${idBase}-quality`,
      title: 'Add one quality running session',
      description: 'Include one threshold or interval workout and keep easy days truly easy.',
      intensity: 'high',
      confidence: 0.74,
      metadata: {
        plannedSessions: 1,
        rationaleTags: ['quality', 'progression'],
      },
    })
  }

  recommendations.push({
    id: `${idBase}-long-run`,
    title: 'Keep long aerobic run',
    description: 'Maintain one longer low-intensity run this week for race-specific endurance.',
    intensity: 'moderate',
    confidence: 0.76,
    metadata: {
      plannedSessions: 1,
      rationaleTags: ['endurance'],
    },
  })

  return recommendations
}

function normalizeRecommendations(recommendations: Recommendation[]): Recommendation[] {
  return recommendations.map((recommendation) => {
    const plannedSessions = recommendation.metadata?.plannedSessions
    const normalizedPlannedSessions =
      typeof plannedSessions === 'number' && Number.isFinite(plannedSessions)
        ? Math.max(0, Math.round(plannedSessions))
        : 1
    const rationaleTags = (recommendation.metadata?.rationaleTags ?? []).filter(
      (tag): tag is string => Boolean(tag),
    )

    return {
      ...recommendation,
      metadata: {
        ...recommendation.metadata,
        plannedSessions: normalizedPlannedSessions,
        ...(rationaleTags.length > 0 ? { rationaleTags } : {}),
      },
    }
  })
}

await main()
