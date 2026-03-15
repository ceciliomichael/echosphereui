import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentPrompt } from '../../electron/chat/prompts/agent/prompt'

test('agent prompt includes identity and tool usage guidance sections', () => {
  const prompt = buildAgentPrompt({
    agentContextRootPath: 'C:/workspace',
    chatMode: 'agent',
    supportsNativeTools: true,
  })

  assert.match(prompt, /<agent_mode>/u)
  assert.match(prompt, /<identity>\n## Identity/u)
  assert.match(prompt, /Operate like a pragmatic pair-programming partner/u)
  assert.match(prompt, /<toolusage>\n## Tool Usage/u)
  assert.match(prompt, /### patch/u)
  assert.match(prompt, /Never place raw\/unprefixed lines inside Update File hunks\./u)
  assert.match(prompt, /Patch preflight: before calling patch, verify each Update File hunk line begins with space\/\+\/-\./u)
  assert.match(prompt, /Send only patch text in the patch argument; do not include markdown fences or narrative text\./u)
  assert.equal(prompt.includes('<autonomy>'), false)
  assert.equal(prompt.includes('<tool_operating_model>'), false)
  assert.equal(prompt.includes('<structure_rules>'), false)
})
