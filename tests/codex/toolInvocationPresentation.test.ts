import assert from 'node:assert/strict'
import test from 'node:test'
import type { ToolInvocationTrace } from '../../src/types/chat'
import { formatStructuredToolResultContent } from '../../src/lib/toolResultContent'
import { getChangeActionLabel, getToolInvocationHeaderLabel } from '../../src/components/chat/toolInvocationPresentation'

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

test('change action labels use created, deleted, and edited wording', () => {
  assert.equal(getChangeActionLabel('add'), 'Created')
  assert.equal(getChangeActionLabel('delete'), 'Deleted')
  assert.equal(getChangeActionLabel('update'), 'Edited')
})

test('apply tool header labels use action-specific running and completed verbs', () => {
  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('add', 'running'), undefined, WORKSPACE_ROOT_PATH), 'Creating example.ts')
  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('add', 'completed'), undefined, WORKSPACE_ROOT_PATH), 'Created example.ts')

  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('delete', 'running'), undefined, WORKSPACE_ROOT_PATH), 'Deleting example.ts')
  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('delete', 'completed'), undefined, WORKSPACE_ROOT_PATH), 'Deleted example.ts')

  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('update', 'running'), undefined, WORKSPACE_ROOT_PATH), 'Editing example.ts')
  assert.equal(getToolInvocationHeaderLabel(buildFileChangeInvocation('update', 'completed'), undefined, WORKSPACE_ROOT_PATH), 'Edited example.ts')
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

  assert.equal(getToolInvocationHeaderLabel(invocation, undefined, WORKSPACE_ROOT_PATH), 'Edited example.ts')
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
