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
  assert.match(prompt, /<task_classification>\n## Task Classification/u)
  assert.match(prompt, /<required_workflow>\n## Required Workflow/u)
  assert.match(prompt, /<structure_rules>\n## Structure Rules/u)
  assert.match(prompt, /<typing_rules>\n## Typing Rules/u)
  assert.match(prompt, /<production_readiness>\n## Production Readiness/u)
  assert.match(prompt, /<verification_gates>\n## Verification Gates/u)
  assert.match(prompt, /<completion_contract>\n## Completion Contract/u)
  assert.match(prompt, /Follow this default loop: classify -> inspect -> plan -> execute -> verify -> summarize\./u)
  assert.match(prompt, /For substantial work, call update_plan before edits\./u)
  assert.match(prompt, /Explore code paths first \(for example src, electron, tests\) before choosing files to change\./u)
  assert.match(prompt, /Do not default to README\/AGENTS\/docs unless the user explicitly requests documentation work\./u)
  assert.match(prompt, /### update_plan/u)
  assert.match(prompt, /### edit/u)
  assert.match(prompt, /### write/u)
  assert.match(prompt, /Use edit for targeted mutations where only part of a file should change\./u)
  assert.match(prompt, /Edit payload shape: \{ "absolute_path": "\.\.\.", \.\.\. \}\./u)
  assert.match(prompt, /Never emit pseudo tool calls in plain text/u)
  assert.equal(prompt.includes('<tool_operating_model>'), false)
})
