import assert from 'node:assert/strict'
import test from 'node:test'
import { FunctionCallingConfigMode } from '@google/genai/web'
import {
  buildAnthropicToolDefinitions,
  buildGoogleToolDefinitions,
  parseToolArgumentsTextToObject,
  toGoogleFunctionCallingMode,
} from '../../electron/chat/providers/providerNativeTools'

test('provider native tool adapters expose OpenAI-compatible tools for Anthropic and Google', () => {
  const anthropicTools = buildAnthropicToolDefinitions('agent')
  const googleTools = buildGoogleToolDefinitions('agent')

  assert.ok(anthropicTools.length > 0)
  assert.ok(googleTools.length > 0)
  assert.ok(googleTools[0]?.functionDeclarations && googleTools[0].functionDeclarations.length > 0)

  const anthropicListTool = anthropicTools.find((tool) => tool.name === 'list')
  assert.ok(anthropicListTool)
  assert.equal(anthropicListTool.input_schema.type, 'object')

  const googleListTool = googleTools[0].functionDeclarations?.find((tool) => tool.name === 'list')
  assert.ok(googleListTool)
  assert.equal(
    (googleListTool.parametersJsonSchema as { type?: string } | undefined)?.type,
    'object',
  )
})

test('provider native tool adapters map forced tool choice for Gemini function calling modes', () => {
  assert.equal(toGoogleFunctionCallingMode(undefined), FunctionCallingConfigMode.AUTO)
  assert.equal(toGoogleFunctionCallingMode('required'), FunctionCallingConfigMode.ANY)
  assert.equal(toGoogleFunctionCallingMode('none'), FunctionCallingConfigMode.NONE)
})

test('provider native tool adapters normalize invalid JSON arguments to an empty object', () => {
  assert.deepEqual(parseToolArgumentsTextToObject('{"path":"C:/repo"}'), { path: 'C:/repo' })
  assert.deepEqual(parseToolArgumentsTextToObject('not json'), {})
  assert.deepEqual(parseToolArgumentsTextToObject('[]'), {})
})
