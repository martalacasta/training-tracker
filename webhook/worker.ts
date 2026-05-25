type WorkerEnv = {
  STRAVA_WEBHOOK_VERIFY_TOKEN?: string
  LLM_API_URL?: string
  LLM_API_KEY?: string
  LLM_MODEL?: string
  GITHUB_MODELS_API_URL?: string
  GITHUB_MODELS_API_KEY?: string
  GITHUB_MODELS_MODEL?: string
  CHAT_DATA_BASE_URL?: string
  CHAT_ALLOWED_ORIGIN?: string
}

type ChatRole = 'system' | 'user' | 'assistant'

type ChatMessage = {
  role: ChatRole
  content: string
}

type ChatRequestPayload = {
  messages?: ChatMessage[]
}

type LlmConfig = {
  apiUrl: string
  apiKey: string
  model: string
}

type ChatCompletionsResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

const DEFAULT_GITHUB_MODELS_API_URL = 'https://models.github.ai/inference/chat/completions'
const CHAT_SYSTEM_PROMPT =
  'You are a supportive running coach. Ground your guidance in the provided athlete data. Give specific next steps (distance, pace, heart-rate guidance when possible), stay realistic, and keep answers concise.'

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/chat') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: buildCorsHeaders(env) })
      }
      if (request.method !== 'POST') {
        return withCors(new Response('Method not allowed', { status: 405 }), env)
      }

      return withCors(await handleChat(request, env), env)
    }

    if (request.method === 'GET') {
      return handleWebhookVerification(url, env)
    }

    if (request.method === 'POST') {
      return handleStravaWebhook(request)
    }

    return new Response('Method not allowed', { status: 405 })
  },
}

async function handleChat(request: Request, env: WorkerEnv): Promise<Response> {
  try {
    const payload = (await request.json()) as ChatRequestPayload
    const messages = normalizeClientMessages(payload.messages)
    if (messages.length === 0) {
      return Response.json({ error: 'messages must include at least one user message' }, { status: 400 })
    }

    const llmConfig = resolveLlmConfig(env)
    if (!llmConfig) {
      return Response.json(
        { error: 'LLM config missing. Set LLM_* or GITHUB_MODELS_* secrets in the Worker.' },
        { status: 503 },
      )
    }

    const context = await loadChatContext(env, request)
    const modelReply = await requestChatCompletion(llmConfig, buildLlmMessages(messages, context))

    return Response.json({
      message: modelReply,
      model: llmConfig.model,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat request failed.'
    return Response.json({ error: message }, { status: 500 })
  }
}

function handleWebhookVerification(url: URL, env: WorkerEnv): Response {
  const mode = url.searchParams.get('hub.mode')
  const challenge = url.searchParams.get('hub.challenge')
  const verifyToken = url.searchParams.get('hub.verify_token')
  const expectedToken = env.STRAVA_WEBHOOK_VERIFY_TOKEN

  if (mode !== 'subscribe' || !challenge || !expectedToken || verifyToken !== expectedToken) {
    return new Response('Webhook verification failed', { status: 403 })
  }

  return Response.json({ 'hub.challenge': challenge })
}

async function handleStravaWebhook(request: Request): Promise<Response> {
  const payload = (await request.json()) as {
    object_id?: number
    object_type?: string
    aspect_type?: string
  }

  if (!payload.object_id || payload.object_type !== 'activity') {
    return new Response('Ignored', { status: 202 })
  }

  console.log('Strava event', payload.object_id, payload.aspect_type)
  return new Response('Accepted', { status: 202 })
}

function resolveLlmConfig(env: WorkerEnv): LlmConfig | null {
  if (env.LLM_API_URL && env.LLM_API_KEY && env.LLM_MODEL) {
    return {
      apiUrl: env.LLM_API_URL,
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL,
    }
  }

  if (env.GITHUB_MODELS_MODEL && env.GITHUB_MODELS_API_KEY) {
    return {
      apiUrl: env.GITHUB_MODELS_API_URL ?? DEFAULT_GITHUB_MODELS_API_URL,
      apiKey: env.GITHUB_MODELS_API_KEY,
      model: env.GITHUB_MODELS_MODEL,
    }
  }

  return null
}

async function requestChatCompletion(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM request failed (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as ChatCompletionsResponse
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLM response did not include content')
  }

  return content.trim()
}

async function loadChatContext(env: WorkerEnv, request: Request): Promise<Record<string, unknown>> {
  const origin = new URL(request.url).origin
  const baseUrl = (env.CHAT_DATA_BASE_URL ?? `${origin}/data`).replace(/\/$/, '')
  const [activities, goals, coachState, insights, recommendations] = await Promise.all([
    fetchJsonOrNull(`${baseUrl}/activities.json`),
    fetchJsonOrNull(`${baseUrl}/goals.json`),
    fetchJsonOrNull(`${baseUrl}/coach-state.json`),
    fetchJsonOrNull(`${baseUrl}/insights.json`),
    fetchJsonOrNull(`${baseUrl}/next-recommendations.json`),
  ])

  return {
    activities,
    goals,
    coachState,
    insights,
    recommendations,
  }
}

async function fetchJsonOrNull(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }

    return (await response.json()) as unknown
  } catch {
    return null
  }
}

function buildLlmMessages(messages: ChatMessage[], context: Record<string, unknown>): ChatMessage[] {
  return [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    {
      role: 'system',
      content: `Grounding context JSON:\n${JSON.stringify(context).slice(0, 12000)}`,
    },
    ...messages,
  ]
}

function normalizeClientMessages(messages: ChatMessage[] | undefined): ChatMessage[] {
  if (!messages || messages.length === 0) {
    return []
  }

  return messages
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => ({
      role: message.role,
      content: typeof message.content === 'string' ? message.content.trim() : '',
    }))
    .filter((message) => message.content.length > 0)
    .slice(-20)
}

function withCors(response: Response, env: WorkerEnv): Response {
  const headers = new Headers(response.headers)
  const cors = buildCorsHeaders(env)
  for (const [key, value] of cors.entries()) {
    headers.set(key, value)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function buildCorsHeaders(env: WorkerEnv): Headers {
  const headers = new Headers()
  headers.set('access-control-allow-origin', env.CHAT_ALLOWED_ORIGIN ?? '*')
  headers.set('access-control-allow-methods', 'POST, OPTIONS')
  headers.set('access-control-allow-headers', 'content-type')
  return headers
}
