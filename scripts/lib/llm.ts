import type { Activity, CoachStateData, Goal, Recommendation } from './types'

type LlmResponse = {
  recommendations: Recommendation[]
}

type LlmMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatCompletionsResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

export type LlmConfig = {
  apiUrl: string
  apiKey: string
  model: string
}

export const DEFAULT_GITHUB_MODELS_API_URL =
  'https://models.github.ai/inference/chat/completions'

export function resolveLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const apiUrl = env.LLM_API_URL
  const apiKey = env.LLM_API_KEY
  const model = env.LLM_MODEL

  if (apiUrl && apiKey && model) {
    return { apiUrl, apiKey, model }
  }

  const githubModel = env.GITHUB_MODELS_MODEL
  const githubApiKey = env.GITHUB_MODELS_API_KEY ?? env.GITHUB_TOKEN
  if (!githubModel || !githubApiKey) {
    return null
  }

  return {
    apiUrl: env.GITHUB_MODELS_API_URL ?? DEFAULT_GITHUB_MODELS_API_URL,
    apiKey: githubApiKey,
    model: githubModel,
  }
}

type LlmJsonRequest = {
  systemPrompt: string
  userPrompt: string
  temperature?: number
  config?: LlmConfig | null
  env?: NodeJS.ProcessEnv
}

export async function maybeGenerateJsonWithLlm<T>({
  systemPrompt,
  userPrompt,
  temperature = 0.2,
  config,
  env,
}: LlmJsonRequest): Promise<T | null> {
  const resolvedConfig = config ?? resolveLlmConfig(env)
  if (!resolvedConfig) {
    return null
  }

  const content = await requestChatCompletion(
    resolvedConfig,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
  )
  return parseLlmJsonContent<T>(content)
}

async function requestChatCompletion(
  config: LlmConfig,
  messages: LlmMessage[],
  temperature: number,
): Promise<string> {
  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`LLM API Error (${response.status}):`, errorText)
    throw new Error(`LLM request failed with status ${response.status}`)
  }

  const data = (await response.json()) as ChatCompletionsResponse
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLM response did not include content')
  }

  return content
}

export function parseLlmJsonContent<T>(content: string): T {
  const trimmed = content.trim()
  const withoutFence = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed

  return JSON.parse(withoutFence) as T
}

export async function maybeGenerateRecommendationsWithLlm(
  goals: Goal[],
  coachState: CoachStateData,
  recentActivities: Activity[],
): Promise<{ recommendations: Recommendation[]; model: string } | null> {
  const config = resolveLlmConfig()
  if (!config) {
    return null
  }

  const systemPrompt = [
    'You are a running and endurance training assistant.',
    'Return only valid JSON with a recommendations array.',
    'Recommendations must be specific and actionable for the next sessions:',
    '- Include concrete workout details in description: distance, sets/reps, and recoveries when relevant.',
    '- For run sessions include explicit pace guidance in min/km.',
    '- Include heart-rate guidance (zone or bpm range) whenever possible.',
    '- Tailor recommendations to the active goal, coach state, and recent training progression.',
    '- Keep recommendations realistic for current fitness and recent sessions.',
  ].join(' ')
  const recentRunInsights = buildRecentRunInsights(recentActivities)
  const userPrompt = JSON.stringify(
    {
      goals,
      coachState,
      recentActivities: recentActivities.slice(0, 14),
      recentRunInsights,
      outputSchema: {
        recommendations: [
          {
            id: 'string',
            title: 'string',
            description: 'string',
            intensity: 'low|moderate|high',
            confidence: 'number between 0 and 1',
          },
        ],
      },
    },
    null,
    2,
  )

  const parsed = await maybeGenerateJsonWithLlm<LlmResponse>({
    systemPrompt,
    userPrompt,
    config,
  })
  if (!parsed) {
    return null
  }

  return {
    recommendations: parsed.recommendations,
    model: config.model,
  }
}

function buildRecentRunInsights(recentActivities: Activity[]): {
  recentRunCount: number
  avgRunDistanceKm: number | null
  avgRunPaceMinPerKm: number | null
  avgRunHeartRate: number | null
} {
  const recentRuns = recentActivities.filter((activity) => activity.sportType === 'Run').slice(0, 8)
  const paceValues = recentRuns
    .map((activity) => activity.averageRhythm)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const heartRateValues = recentRuns
    .map((activity) => activity.averageHeartRate)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const avgDistance =
    recentRuns.length > 0
      ? round(recentRuns.reduce((total, activity) => total + activity.distanceKm, 0) / recentRuns.length, 2)
      : null
  const avgPace =
    paceValues.length > 0
      ? round(paceValues.reduce((total, value) => total + value, 0) / paceValues.length, 2)
      : null
  const avgHeartRate =
    heartRateValues.length > 0
      ? round(heartRateValues.reduce((total, value) => total + value, 0) / heartRateValues.length, 0)
      : null

  return {
    recentRunCount: recentRuns.length,
    avgRunDistanceKm: avgDistance,
    avgRunPaceMinPerKm: avgPace,
    avgRunHeartRate: avgHeartRate,
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
