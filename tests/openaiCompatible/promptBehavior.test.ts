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
  assert.match(prompt, /You are Echo, a senior coding agent\. Stay autonomous, context-first, and workspace-focused\./u)
  assert.match(prompt, /<workspace_context>\n## Workspace Context/u)
  assert.ok(prompt.includes('Workspace root: `C:/workspace`'))
  assert.match(prompt, /When a tool requires a path, send a real absolute filesystem path rooted in the workspace and describe the target clearly/u)
  assert.match(prompt, /Read the workspace context first\. Classify the request, then inspect the repository, form a brief plan, and act\./u)
  assert.match(prompt, /<shell_context>\n## Shell Context/u)
  assert.match(prompt, /Terminal execution mode is `full`/u)
  assert.equal(prompt.includes('\n- '), false)
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
  assert.match(prompt, /You are Echo in Plan mode\. Stay context-first and practical\./u)
  assert.match(prompt, /<workspace_context>\n## Workspace Context/u)
  assert.match(prompt, /Assume the user is asking about this workspace unless they say otherwise, and keep the plan anchored to files, folders, and behavior inside that root\./u)
  assert.match(prompt, /Make a concrete plan with files, boundaries, and checks\./u)
  assert.match(prompt, /Use todo_write only when the work is large enough to benefit from tracked tasks\./u)
  assert.match(prompt, /<shell_context>\n## Shell Context/u)
  assert.match(prompt, /Terminal execution mode is `full`/u)
  assert.equal(prompt.includes('\n- '), false)
})
