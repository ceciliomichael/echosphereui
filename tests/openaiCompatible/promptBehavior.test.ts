import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentPrompt } from '../../electron/chat/prompts/agent/prompt'

test('agent prompt only includes the identity section', () => {
  const prompt = buildAgentPrompt({
    agentContextRootPath: 'C:/workspace',
    chatMode: 'agent',
    supportsNativeTools: true,
  })

  assert.match(prompt, /<agent_prompt>/u)
  assert.match(prompt, /<identity>\n## Identity/u)
  assert.match(prompt, /Operate like a pragmatic pair-programming partner/u)
  assert.equal(prompt.includes('<autonomy>'), false)
  assert.equal(prompt.includes('<tool_operating_model>'), false)
  assert.equal(prompt.includes('<structure_rules>'), false)
})
