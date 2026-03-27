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
    /You are Echo, a senior production-grade coding agent\. Aim for maintainable, testable, scalable changes that fit the repository conventions\./u,
  )
  assert.match(prompt, /<workspace_context>\n## Workspace Context/u)
  assert.ok(prompt.includes('Workspace root: `C:/workspace`'))
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
    workspaceFileTree: 'src/\n  main.ts\n',
  })

  assert.match(prompt, /<plan_mode>/u)
  assert.match(prompt, /<identity>\n## Identity/u)
  assert.match(prompt, /You are Echo in Plan mode\. Help shape a practical, implementation-ready plan/u)
  assert.match(prompt, /<workspace_context>\n## Workspace Context/u)
  assert.match(prompt, /<instruction_precedence>\n## Instruction Priority/u)
  assert.match(prompt, /Higher-priority instructions take precedence: system, developer, user, then repository instructions included in the prompt\./u)
  assert.match(prompt, /<agents_scope>\n## Repository Instruction Scope/u)
  assert.match(prompt, /Repository instruction files apply to the directory that contains them and all descendant paths\./u)
  assert.match(prompt, /<workspace_folder_tree>\n## Workspace Folder Tree \(gitignore-filtered\)/u)
  assert.match(prompt, /<workflow>\n## Planning Approach/u)
  assert.match(prompt, /Start by identifying the relevant files, behaviors, and constraints\./u)
  assert.match(prompt, /Build a concrete implementation plan with affected files, responsibility boundaries, and verification steps\./u)
  assert.match(prompt, /Preserve multiline structure and indentation when describing edits or examples\./u)
  assert.match(prompt, /<plan_shape>\n## Preferred Plan Shape/u)
  assert.match(prompt, /Goal or desired outcome\./u)
  assert.match(prompt, /<toolusage>\n## Tool Guidance/u)
  assert.match(prompt, /Use only planning tools available in this mode\./u)
  assert.match(prompt, /`ask_question` is helpful when a missing decision would materially affect correctness or scope\./u)
  assert.match(prompt, /Use `list`, `read`, `glob`, and `grep` to inspect the workspace before proposing edits\./u)
  assert.match(prompt, /Use `ready_implement` when the plan is ready for approval\./u)
  assert.match(prompt, /<shell_context>\n## Shell Context/u)
  assert.match(prompt, /Terminal execution mode is `full`/u)
})
