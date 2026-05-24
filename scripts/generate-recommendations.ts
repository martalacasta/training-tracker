import dayjs from 'dayjs'
import { readDataFile, writeDataFile } from './lib/json'
import { maybeGenerateRecommendationsWithLlm } from './lib/llm'
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

async function main() {
  const activities = await readDataFile<ActivitiesData>('activities.json', emptyActivities)
  const coachState = await readDataFile<CoachStateData>('coach-state.json', emptyCoachState)
  const goals = await readDataFile<GoalsData>('goals.json', emptyGoals)
  const recent = activities.items.slice().sort((a, b) => b.startDate.localeCompare(a.startDate))

  const llmRecommendations = await maybeGenerateRecommendationsWithLlm(
    goals.items,
    coachState,
    recent,
  )
  const recommendations = llmRecommendations ?? generateRuleBasedRecommendations(coachState)

  const output: RecommendationsData = {
    updatedAt: new Date().toISOString(),
    items: recommendations,
  }
  await writeDataFile('next-recommendations.json', output)
  console.log(`Generated ${recommendations.length} recommendations.`)
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
    })
  } else {
    recommendations.push({
      id: `${idBase}-quality`,
      title: 'Add one quality running session',
      description: 'Include one threshold or interval workout and keep easy days truly easy.',
      intensity: 'high',
      confidence: 0.74,
    })
  }

  recommendations.push({
    id: `${idBase}-long-run`,
    title: 'Keep long aerobic run',
    description: 'Maintain one longer low-intensity run this week for race-specific endurance.',
    intensity: 'moderate',
    confidence: 0.76,
  })

  return recommendations
}

await main()
