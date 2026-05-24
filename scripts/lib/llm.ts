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
  'https://models.inference.ai.azure.com/chat/completions'

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
): Promise<Recommendation[] | null> {
  const systemPrompt =
    'You are a running and endurance training assistant. Return only valid JSON with a recommendations array.'
  const userPrompt = JSON.stringify(
    {
      goals,
      coachState,
      recentActivities: recentActivities.slice(0, 14),
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
  })
  if (!parsed) {
    return null
  }

  return parsed.recommendations
}
