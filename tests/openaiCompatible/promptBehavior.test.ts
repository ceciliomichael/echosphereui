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
  assert.match(
    prompt,
    /You are Echo in Plan mode\. Focus on producing a clear, practical, maintainable, testable, and scalable plan that can be implemented directly\./u,
  )
  assert.match(prompt, /<workspace_context>\n## Workspace Context/u)
  assert.match(prompt, /<maintainability>\n## Maintainability/u)
  assert.match(
    prompt,
    /Prefer maintainable, testable, scalable changes that are easy for other engineers to extend\./u,
  )
  assert.match(prompt, /Optimize for long-term code quality over the shortest path\./u)
  assert.match(
    prompt,
    /Match repository conventions unless they clearly conflict with correctness or maintainability\./u,
  )
  assert.match(prompt, /<workspace_folder_tree>\n## Workspace Folder Tree \(gitignore-filtered\)/u)
  assert.match(prompt, /<workflow>\n## Planning Approach/u)
  assert.match(prompt, /Identify the relevant files, behaviors, and constraints first\./u)
  assert.match(prompt, /Build a concrete implementation plan with clear steps and file-level impact\./u)
  assert.match(prompt, /Keep the scope tight, practical, and reversible\./u)
  assert.match(prompt, /Include verification only when it adds real value\./u)
  assert.equal(prompt.includes('<instruction_precedence>'), false)
  assert.equal(prompt.includes('<agents_scope>'), false)
  assert.equal(prompt.includes('<plan_shape>'), false)
  assert.equal(prompt.includes('<toolusage>'), false)
  assert.equal(prompt.includes('<shell_context>'), false)
})
