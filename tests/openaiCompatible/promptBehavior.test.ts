import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentPrompt } from '../../electron/chat/prompts/agent/prompt'
import { buildPlanPrompt } from '../../electron/chat/prompts/plan/prompt'

test('agent prompt stays compact and workspace-first', () => {
  const prompt = buildAgentPrompt({
    agentContextRootPath: 'C:/workspace',
    chatMode: 'agent',
    supportsNativeTools: true,
    terminalExecutionMode: 'full',
  })

  assert.match(prompt, /<agent_mode>/u)
  assert.match(prompt, /<identity>\n## Identity/u)
  assert.match(
    prompt,
    /You are Echo, a senior production-grade coding agent\. Default to maintainable, testable, scalable solutions/u,
  )
  assert.match(prompt, /<workspace_context>\n## Workspace Context/u)
  assert.ok(prompt.includes('Workspace root: `C:/workspace`'))
  assert.match(prompt, /<instruction_precedence>\n## Instruction Precedence/u)
  assert.match(prompt, /Follow this priority order: system instructions, developer instructions, user request/u)
  assert.match(prompt, /<agents_scope>\n## AGENTS Scope/u)
  assert.match(prompt, /AGENTS\.md files apply to the directory that contains them and all descendant paths\./u)
  assert.match(prompt, /When a tool requires a path, send a real absolute filesystem path rooted in the workspace\./u)
  assert.match(prompt, /Read the workspace context first\. Classify the request, inspect relevant files, form a concrete short plan/u)
  assert.match(prompt, /<execution_contract>\n## Execution Contract/u)
  assert.match(prompt, /<shell_context>\n## Shell Context/u)
  assert.match(prompt, /Terminal execution mode is `full`/u)
  assert.equal(prompt.includes('<task_classification>'), false)
  assert.equal(prompt.includes('<required_workflow>'), false)
  assert.equal(prompt.includes('<production_readiness>'), false)
})

test('plan prompt stays compact and scope-first', () => {
  const prompt = buildPlanPrompt({
    agentContextRootPath: 'C:/workspace',
    chatMode: 'plan',
    supportsNativeTools: true,
    terminalExecutionMode: 'full',
  })

  assert.match(prompt, /<plan_mode>/u)
  assert.match(prompt, /<identity>\n## Identity/u)
  assert.match(prompt, /You are Echo in Plan mode\. Produce maintainable, implementation-ready plans/u)
  assert.match(prompt, /<workspace_context>\n## Workspace Context/u)
  assert.match(prompt, /<instruction_precedence>\n## Instruction Precedence/u)
  assert.match(prompt, /<agents_scope>\n## AGENTS Scope/u)
  assert.match(prompt, /Build a concrete implementation plan with affected files, responsibility boundaries, and verification steps\./u)
  assert.match(prompt, /Use todo_write only for non-trivial multi-step work\./u)
  assert.match(prompt, /Use ask_question only when a missing user decision materially affects correctness or scope\./u)
  assert.match(prompt, /<shell_context>\n## Shell Context/u)
  assert.match(prompt, /Terminal execution mode is `full`/u)
})
