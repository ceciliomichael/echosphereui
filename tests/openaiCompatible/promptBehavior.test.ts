import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentPrompt } from '../../electron/chat/prompts/agent/prompt'

test('agent prompt includes identity and tool usage guidance sections', () => {
  const prompt = buildAgentPrompt({
    agentContextRootPath: 'C:/workspace',
    chatMode: 'agent',
    supportsNativeTools: true,
    terminalExecutionMode: 'full',
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
  assert.match(prompt, /<shell_context>\n## Shell Context/u)
  assert.match(prompt, /Host platform: `[A-Za-z]+` \(`\w+`\)/u)
  assert.match(prompt, /Terminal execution mode: `full`/u)
  assert.match(prompt, /Use this workflow for every task type: classify -> inspect -> plan -> execute -> verify -> summarize\./u)
  assert.match(prompt, /Step 0 \(always\): restate the user request and challenge weak assumptions or risky approaches before execution\./u)
  assert.match(prompt, /For substantial multi-step work, call update_plan before execution and update it only when step status changes\./u)
  assert.match(prompt, /Explore code paths first \(for example src, electron, tests\) before choosing files to change\./u)
  assert.match(prompt, /Do not default to README\/AGENTS\/docs unless the user explicitly requests documentation work\./u)
  assert.match(prompt, /Classify every user message before acting/u)
  assert.match(prompt, /Interpret vague phrasing like "add more sections" against current context first/u)
  assert.match(prompt, /### update_plan/u)
  assert.match(prompt, /### edit/u)
  assert.match(prompt, /### write/u)
  assert.match(prompt, /Use edit for targeted mutations where only part of a file should change\./u)
  assert.match(prompt, /Edit payload shape: \{ "absolute_path": "\.\.\.", \.\.\. \}\./u)
  assert.match(prompt, /Never emit pseudo tool calls in plain text/u)
  assert.match(prompt, /Never prefix tool names with `functions\.` or any other namespace/u)
  assert.equal(prompt.includes('<tool_operating_model>'), false)
})
