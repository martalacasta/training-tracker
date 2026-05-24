import type { Activity, CoachStateData, Goal, Recommendation } from './types'

type LlmResponse = {
  recommendations: Recommendation[]
}

export async function maybeGenerateRecommendationsWithLlm(
  goals: Goal[],
  coachState: CoachStateData,
  recentActivities: Activity[],
): Promise<Recommendation[] | null> {
  const apiUrl = process.env.LLM_API_URL
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL

  if (!apiUrl || !apiKey || !model) {
    return null
  }

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

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM request failed with status ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLM response did not include content')
  }

  const parsed = JSON.parse(content) as LlmResponse
  return parsed.recommendations
}
