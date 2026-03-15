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
  assert.match(prompt, /<autonomy>\n## Autonomy/u)
  assert.match(prompt, /<tool_operating_model>\n## Tool Operating Model/u)
  assert.match(prompt, /<structure_rules>\n## Structure Rules/u)
  assert.match(prompt, /<typing_rules>\n## Typing Rules/u)
  assert.match(prompt, /<production_readiness>\n## Production Readiness/u)
  assert.match(prompt, /<verification_gates>\n## Verification Gates/u)
  assert.match(prompt, /<tool_result_memory>\n## Tool Result Memory/u)
  assert.equal(prompt.includes('Always begin codebase discovery by listing the locked root directory'), false)
  assert.match(prompt, /Operate like a pragmatic pair-programming partner/u)
  assert.match(prompt, /Be autonomous by default/u)
  assert.match(prompt, /List root once only when needed/u)
  assert.match(prompt, /Treat prompt instructions as an operating contract/u)
  assert.match(prompt, /Use tools only when they answer a real question or unlock the next action/u)
  assert.match(prompt, /Read once, then act\. Do not reread the same unchanged range for comfort/u)
  assert.match(prompt, /After a successful patch, trust the patch result as the current state/u)
  assert.match(prompt, /Reread only if output was partial, the workspace changed, or you need new lines you never read/u)
  assert.match(prompt, /Read only the needed file and line range/u)
  assert.match(prompt, /ranges are inclusive, max 500 lines per call/u)
  assert.match(prompt, /next_start_line and next_end_line/u)
  assert.match(prompt, /Never reread the same unchanged range just to verify or feel safe/u)
  assert.match(prompt, /Stop tooling when context is enough to answer or implement/u)
  assert.match(prompt, /For code changes, make a short plan before editing/u)
  assert.match(prompt, /Run relevant checks: tests, type checks, lint, or targeted diagnostics/u)
  assert.match(prompt, /exec_command/u)
  assert.match(prompt, /write_stdin/u)
  assert.match(prompt, /Do not call apply_patch via exec_command/u)
  assert.match(prompt, /Trust tool results as source of truth/u)
  assert.match(prompt, /Default behavior is read once and reuse/u)
  assert.match(prompt, /Do not reread unchanged content to reassure yourself/u)
  assert.match(prompt, /After patch success, continue using the patch result as current file state/u)
  assert.match(prompt, /Reread only for missing lines, changed files, or new dependencies/u)
  assert.match(prompt, /Before any new call, check if prior results already answer it/u)
  assert.match(prompt, /Separate code by responsibility, not by file length/u)
  assert.match(prompt, /Do not introduce any/u)
  assert.match(prompt, /Build for production, not just for a happy-path demo/u)
  assert.match(prompt, /Before considering a task complete, verify that the solution matches the user request and stays within scope/u)
  assert.match(prompt, /Do not claim completion while known breakage introduced by the change remains unresolved/u)
})
