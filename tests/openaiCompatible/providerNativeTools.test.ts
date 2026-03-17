import assert from 'node:assert/strict'
import test from 'node:test'
import { FunctionCallingConfigMode } from '@google/genai/web'
import {
  buildAnthropicToolDefinitions,
  buildGoogleToolDefinitions,
  buildMistralToolDefinitions,
  normalizeToolCallPaths,
  parseToolArgumentsTextToObject,
  toGoogleFunctionCallingMode,
  toMistralToolChoice,
} from '../../electron/chat/providers/providerNativeTools'
import { ToolChoiceEnum } from '@mistralai/mistralai/models/components'

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

test('provider native tool adapters expose OpenAI-compatible tools for Mistral and map tool choice', () => {
  const mistralTools = buildMistralToolDefinitions('agent')

  assert.ok(mistralTools.length > 0)
  const mistralListTool = mistralTools.find((tool) => tool.function.name === 'list')
  assert.ok(mistralListTool)
  assert.equal((mistralListTool?.function.parameters as { type?: string })?.type, 'object')

  assert.equal(toMistralToolChoice(undefined), ToolChoiceEnum.Auto)
  assert.equal(toMistralToolChoice('required'), ToolChoiceEnum.Required)
  assert.equal(toMistralToolChoice('none'), ToolChoiceEnum.None)
})

test('provider native tool adapters normalize invalid JSON arguments to an empty object', () => {
  assert.deepEqual(parseToolArgumentsTextToObject('{"path":"C:/repo"}'), { path: 'C:/repo' })
  assert.deepEqual(parseToolArgumentsTextToObject('not json'), {})
  assert.deepEqual(parseToolArgumentsTextToObject('[]'), {})
})

test('provider native tool adapters normalize relative absolute_path arguments to workspace absolute paths', () => {
  const normalizedToolCall = normalizeToolCallPaths(
    {
      argumentsText: '{"absolute_path":".","limit":50}',
      id: 'call-list',
      name: 'list',
      startedAt: 1,
    },
    'C:/workspace',
  )

  assert.equal(normalizedToolCall.id, 'call-list')
  assert.equal(normalizedToolCall.name, 'list')
  assert.equal(normalizedToolCall.startedAt, 1)
  assert.deepEqual(parseToolArgumentsTextToObject(normalizedToolCall.argumentsText), {
    absolute_path: 'C:\\workspace',
    limit: 50,
  })
})
