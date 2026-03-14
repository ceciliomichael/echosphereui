import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentPrompt } from '../../electron/chat/prompts/agent/prompt'

test('agent prompt encourages selective exploration instead of repeated root listings', () => {
  const prompt = buildAgentPrompt({
    agentContextRootPath: 'C:/workspace',
    chatMode: 'agent',
    supportsNativeTools: true,
  })

  assert.match(prompt, /<agent_prompt>/u)
  assert.match(prompt, /<tool_result_memory>/u)
  assert.equal(prompt.includes('Always begin codebase discovery by listing the locked root directory'), false)
  assert.match(prompt, /List the locked root once only when structure is unknown/u)
  assert.match(prompt, /Use read only for the exact file and line range needed/u)
  assert.match(prompt, /Use read metadata fields .* for continuation decisions/u)
  assert.match(prompt, /Stop using tools as soon as you have enough context/u)
  assert.match(prompt, /Do not explore for reassurance/u)
  assert.match(prompt, /Treat every tool result as authoritative source of truth/u)
  assert.match(prompt, /After successful write or edit, trust the mutation result for that path by default/u)
  assert.match(prompt, /Do not repeat successful inspection calls .* with the same arguments/u)
  assert.match(prompt, /Do not issue multiple write or edit calls for the same path in one response/u)
  assert.match(prompt, /Reuse tool-result metadata and arguments from history before issuing additional tool calls/u)
  assert.match(prompt, /Each next tool call must be justified by new information needs, not reassurance/u)
})
