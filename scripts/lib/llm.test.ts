import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_GITHUB_MODELS_API_URL,
  parseLlmJsonContent,
  resolveLlmConfig,
} from './llm'

test('resolveLlmConfig prefers explicit LLM_* settings', () => {
  const config = resolveLlmConfig({
    LLM_API_URL: 'https://example.test/chat',
    LLM_API_KEY: 'llm-key',
    LLM_MODEL: 'gpt-test',
    GITHUB_MODELS_MODEL: 'should-not-be-used',
    GITHUB_MODELS_API_KEY: 'gh-key',
  })

  assert.deepEqual(config, {
    apiUrl: 'https://example.test/chat',
    apiKey: 'llm-key',
    model: 'gpt-test',
  })
})

test('resolveLlmConfig supports GitHub Models settings', () => {
  const config = resolveLlmConfig({
    GITHUB_MODELS_MODEL: 'openai/gpt-4.1',
    GITHUB_TOKEN: 'token',
  })

  assert.deepEqual(config, {
    apiUrl: DEFAULT_GITHUB_MODELS_API_URL,
    apiKey: 'token',
    model: 'openai/gpt-4.1',
  })
})

test('resolveLlmConfig returns null when config is incomplete', () => {
  const config = resolveLlmConfig({
    LLM_API_URL: 'https://example.test/chat',
    LLM_API_KEY: 'llm-key',
  })

  assert.equal(config, null)
})

test('parseLlmJsonContent parses fenced json', () => {
  const value = parseLlmJsonContent<{ hello: string }>('```json\n{"hello":"world"}\n```')
  assert.deepEqual(value, { hello: 'world' })
})
