import assert from 'node:assert/strict'
import test from 'node:test'
import type { ToolInvocationTrace } from '../../src/types/chat'
import { formatStructuredToolResultContent } from '../../src/lib/toolResultContent'
import {
  getToolInvocationDisplayEntries,
  getToolInvocationHeaderLabel,
} from '../../src/components/chat/toolInvocationPresentation'

const WORKSPACE_ROOT_PATH = '/workspace'
const TARGET_FILE_PATH = `${WORKSPACE_ROOT_PATH}/src/example.ts`

function buildFileChangeInvocation(
  kind: 'add' | 'delete' | 'update',
  state: ToolInvocationTrace['state'],
  overrides?: Partial<ToolInvocationTrace>,
) {
  const semanticsByKind = {
    add: {
      added_path_count: 1,
      deleted_path_count: 0,
      operation: 'edit',
      updated_path_count: 0,
    },
    delete: {
      added_path_count: 0,
      deleted_path_count: 1,
      operation: 'edit',
      updated_path_count: 0,
    },
    update: {
      added_path_count: 0,
      deleted_path_count: 0,
      operation: 'edit',
      updated_path_count: 1,
    },
  } as const

  const invocation: ToolInvocationTrace = {
    argumentsText: JSON.stringify({ absolute_path: TARGET_FILE_PATH }),
    id: 'tool-1',
    resultContent: formatStructuredToolResultContent(
      {
        schema: 'echosphere.tool_result/v1',
        semantics: semanticsByKind[kind],
        status: 'success',
        subject: {
          kind: 'file',
          path: TARGET_FILE_PATH,
        },
        summary: 'Applied file change',
        toolCallId: 'tool-1',
        toolName: 'apply',
      },
      null,
    ),
    startedAt: 0,
    state,
    toolName: 'apply',
    ...overrides,
  }

  return invocation
}

function buildMultiFileApplyInvocation(
  toolName: 'apply' | 'apply_patch',
  state: ToolInvocationTrace['state'],
  changes: Array<{
    fileName: string
    kind: 'add' | 'delete' | 'update'
    oldContent: string | null
    newContent: string
  }>,
) {
  return {
    argumentsText: JSON.stringify({ absolute_path: `${WORKSPACE_ROOT_PATH}/.` }),
    id: 'tool-multi-1',
    resultContent: formatStructuredToolResultContent(
      {
        schema: 'echosphere.tool_result/v1',
        semantics: {
          added_path_count: changes.filter((change) => change.kind === 'add').length,
          deleted_path_count: changes.filter((change) => change.kind === 'delete').length,
          operation: 'edit',
          updated_path_count: changes.filter((change) => change.kind === 'update').length,
        },
        status: 'success',
        subject: {
          kind: 'workspace',
          path: '.',
        },
        summary: 'Patched multiple files',
        toolCallId: 'tool-multi-1',
        toolName,
      },
      [
        'Patched multiple files',
        ...changes.map((change) => `${change.kind === 'add' ? 'A' : change.kind === 'delete' ? 'D' : 'M'} ${change.fileName}`),
      ].join('\n'),
    ),
    resultPresentation: {
      changes: changes.map((change) => ({
        fileName: change.fileName,
        kind: change.kind,
        newContent: change.newContent,
        oldContent: change.oldContent,
      })),
      kind: 'change_diff' as const,
    },
    startedAt: 0,
    state,
    toolName,
  } satisfies ToolInvocationTrace
}

test('apply tool header labels use generic applying and applied verbs', () => {
  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('add', 'running'), undefined, WORKSPACE_ROOT_PATH), 'Applying example.ts')
  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('add', 'completed'), undefined, WORKSPACE_ROOT_PATH), 'Applied example.ts')

  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('delete', 'running'), undefined, WORKSPACE_ROOT_PATH), 'Applying example.ts')
  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('delete', 'completed'), undefined, WORKSPACE_ROOT_PATH), 'Applied example.ts')

  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('update', 'running'), undefined, WORKSPACE_ROOT_PATH), 'Applying example.ts')
  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('update', 'completed'), undefined, WORKSPACE_ROOT_PATH), 'Applied example.ts')
})

test('apply tool header labels keep mixed changes on the generic edit fallback', () => {
  const invocation = buildFileChangeInvocation('update', 'completed', {
    resultContent: formatStructuredToolResultContent(
      {
        schema: 'echosphere.tool_result/v1',
        semantics: {
          added_path_count: 1,
          deleted_path_count: 0,
          operation: 'edit',
          updated_path_count: 1,
        },
        status: 'success',
        subject: {
          kind: 'workspace',
          path: '.',
        },
        summary: 'Applied mixed file changes',
        toolCallId: 'tool-1',
        toolName: 'apply',
      },
      null,
    ),
  })

  assert.equal(getToolInvocationHeaderLabel(invocation, undefined, WORKSPACE_ROOT_PATH), 'Applied example.ts')
})

test('multi-file apply_patch invocations expand into separate display blocks', () => {
  const invocation = buildMultiFileApplyInvocation('apply_patch', 'completed', [
    {
      fileName: 'src/first.ts',
      kind: 'update',
      oldContent: 'const first = 1;\n',
      newContent: 'const first = 2;\n',
    },
    {
      fileName: 'src/second.ts',
      kind: 'add',
      oldContent: null,
      newContent: 'export const second = 2;\n',
    },
  ])

  const displayEntries = getToolInvocationDisplayEntries(invocation)

  assert.equal(displayEntries.length, 2)
  assert.equal(
    getToolInvocationHeaderLabel(displayEntries[0].invocation, undefined, WORKSPACE_ROOT_PATH),
    'Applied first.ts',
  )
  assert.equal(
    getToolInvocationHeaderLabel(displayEntries[1].invocation, undefined, WORKSPACE_ROOT_PATH),
    'Applied second.ts',
  )
  assert.equal(displayEntries[0].invocation.resultPresentation?.kind, 'change_diff')
  assert.equal(displayEntries[0].invocation.resultPresentation?.changes.length, 1)
  assert.equal(displayEntries[1].invocation.resultPresentation?.kind, 'change_diff')
  assert.equal(displayEntries[1].invocation.resultPresentation?.changes.length, 1)
})

test('multi-file apply invocations expand into separate display blocks', () => {
  const invocation = buildMultiFileApplyInvocation('apply', 'completed', [
    {
      fileName: 'src/first.ts',
      kind: 'update',
      oldContent: 'const first = 1;\n',
      newContent: 'const first = 2;\n',
    },
    {
      fileName: 'src/second.ts',
      kind: 'add',
      oldContent: null,
      newContent: 'export const second = 2;\n',
    },
  ])

  const displayEntries = getToolInvocationDisplayEntries(invocation)

  assert.equal(displayEntries.length, 2)
  assert.equal(
    getToolInvocationHeaderLabel(displayEntries[0].invocation, undefined, WORKSPACE_ROOT_PATH),
    'Applied first.ts',
  )
  assert.equal(
    getToolInvocationHeaderLabel(displayEntries[1].invocation, undefined, WORKSPACE_ROOT_PATH),
    'Applied second.ts',
  )
  assert.equal(displayEntries[0].invocation.resultPresentation?.kind, 'change_diff')
  assert.equal(displayEntries[0].invocation.resultPresentation?.changes.length, 1)
  assert.equal(displayEntries[1].invocation.resultPresentation?.kind, 'change_diff')
  assert.equal(displayEntries[1].invocation.resultPresentation?.changes.length, 1)
})

test('read tool header labels collapse to the basename for the visible toolblock', () => {
  const invocation: ToolInvocationTrace = {
    argumentsText: JSON.stringify({ absolute_path: TARGET_FILE_PATH }),
    id: 'tool-read-1',
    resultContent: formatStructuredToolResultContent(
      {
        arguments: {
          absolute_path: TARGET_FILE_PATH,
        },
        schema: 'echosphere.tool_result/v1',
        status: 'success',
        subject: {
          kind: 'file',
          path: 'src/example.ts',
        },
        summary: 'Read src/example.ts',
        toolCallId: 'tool-read-1',
        toolName: 'read',
      },
      '1: export const value = 1;',
    ),
    startedAt: 0,
    state: 'completed',
    toolName: 'read',
  }

  assert.equal(getToolInvocationHeaderLabel(invocation, undefined, WORKSPACE_ROOT_PATH), 'Read example.ts')
})

test('terminal tool header labels prefer the queued command and fall back to the session id', () => {
  const commandInvocation: ToolInvocationTrace = {
    argumentsText: JSON.stringify({
      command: 'npm run test:unit',
      session_id: 7,
    }),
    id: 'tool-terminal-1',
    startedAt: 0,
    state: 'completed',
    toolName: 'run_terminal',
  }

  const sessionInvocation: ToolInvocationTrace = {
    argumentsText: JSON.stringify({
      polling_ms: 2500,
      session_id: 7,
    }),
    id: 'tool-terminal-2',
    startedAt: 0,
    state: 'running',
    toolName: 'get_terminal_output',
  }

  assert.equal(
    getToolInvocationHeaderLabel(commandInvocation, undefined, WORKSPACE_ROOT_PATH),
    'Ran npm run test:unit',
  )
  assert.equal(
    getToolInvocationHeaderLabel(sessionInvocation, undefined, WORKSPACE_ROOT_PATH),
    'Polling session 7',
  )
})
