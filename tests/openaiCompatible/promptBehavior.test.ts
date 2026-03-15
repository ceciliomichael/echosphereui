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
  assert.match(prompt, /Operate like a pragmatic pair-programming partner/u)
  assert.match(prompt, /List the locked root once only when structure is unknown/u)
  assert.match(prompt, /Use read only for the exact file and line range needed/u)
  assert.match(prompt, /ranges are inclusive and should target at most 500 lines per call/u)
  assert.match(prompt, /prefer the returned next_start_line and next_end_line metadata instead of manually guessing line bounds/u)
  assert.match(prompt, /Use read metadata fields .* for continuation decisions/u)
  assert.match(prompt, /Stop using tools as soon as you have enough context/u)
  assert.match(prompt, /Do not explore for reassurance/u)
  assert.match(prompt, /Do not restart discovery after each extracted feature or subtask/u)
  assert.match(prompt, /Use a single-pass execution loop: decide what is needed, inspect minimally, implement, verify, then stop/u)
  assert.match(prompt, /exec_command/u)
  assert.match(prompt, /write_stdin/u)
  assert.match(prompt, /Never invoke apply_patch through exec_command/u)
  assert.match(prompt, /Treat every tool result as authoritative source of truth/u)
  assert.match(prompt, /Default to read-once behavior/u)
  assert.match(prompt, /After a successful patch, trust the mutation result for that path by default and continue execution without immediate confirmation reads/u)
  assert.match(prompt, /Reread only when evidence is invalidated by partial output, an explicit workspace mutation, or a newly discovered dependency/u)
  assert.match(prompt, /Do not issue multiple patch calls for the same path in one response/u)
  assert.match(prompt, /Reuse tool-result metadata and prior arguments before issuing additional tool calls/u)
  assert.match(prompt, /Each next tool call must be justified by a concrete unanswered question, not reassurance/u)
})
