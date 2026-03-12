import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentPrompt } from '../../electron/chat/prompts/agent/prompt'

test('agent prompt encourages selective exploration instead of repeated root listings', () => {
  const prompt = buildAgentPrompt({
    agentContextRootPath: 'C:/workspace',
    chatMode: 'agent',
    supportsNativeTools: true,
  })

  assert.equal(prompt.includes('Always begin codebase discovery by listing the locked root directory'), false)
  assert.match(prompt, /List the locked root directory once when workspace structure is unknown/u)
  assert.match(prompt, /Stop using tools as soon as you have enough context/u)
  assert.match(prompt, /Do not explore for reassurance/u)
})
