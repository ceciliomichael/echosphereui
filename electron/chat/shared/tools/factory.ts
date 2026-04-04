import { jsonSchema, tool, type ToolSet } from 'ai'
import type { ChatMode } from '../../../../src/types/chat'
import type { AgentToolContext, AgentToolExecutionResult } from '../toolTypes'
import {
  createApplyPatchToolResult,
  createGlobToolResult,
  createGrepToolResult,
  createListToolResult,
  createReadToolResult,
  createToolContext,
  createWholeFileApplyTool,
  resolveWorkspaceTargetPath,
} from './workspaceTools'

function createToolErrorResult(summary: string, body?: string): AgentToolExecutionResult {
  return {
    ...(body ? { body } : {}),
    status: 'error',
    summary,
  }
}

export async function createAgentTools(input: AgentToolContext, options?: { chatMode?: ChatMode }): Promise<ToolSet> {
  const context = await createToolContext(input)
  const wholeFileApplyTool = createWholeFileApplyTool(context)
  const isPlanMode = options?.chatMode === 'plan'

  const tools: ToolSet = {
    list: tool({
      description: 'Recursively list files from a workspace directory. Prefer this before reading when you need orientation.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          absolute_path: {
            type: 'string',
          },
        },
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as { absolute_path?: string }
        try {
          const target = resolveWorkspaceTargetPath(context.workspaceRootPath, inputValue.absolute_path)
          return await createListToolResult(context.workspaceRootPath, target.absolutePath, target.relativePath)
        } catch (error) {
          return createToolErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'List failed.',
          )
        }
      },
    }),
    read: tool({
      description: 'Read a UTF-8 text file with numbered lines. Use offset to continue large files.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          absolute_path: {
            type: 'string',
          },
          limit: {
            minimum: 1,
            type: 'number',
          },
          offset: {
            minimum: 1,
            type: 'number',
          },
        },
        required: ['absolute_path'],
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as {
          absolute_path: string
          limit?: number
          offset?: number
        }
        try {
          const target = resolveWorkspaceTargetPath(context.workspaceRootPath, inputValue.absolute_path)
          return await createReadToolResult(target.absolutePath, target.relativePath, inputValue.offset, inputValue.limit)
        } catch (error) {
          return createToolErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Read failed.',
          )
        }
      },
    }),
    glob: tool({
      description: 'Find files by glob pattern within the workspace. Use this when you know filename shape but not the exact location.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          absolute_path: {
            type: 'string',
          },
          pattern: {
            minLength: 1,
            type: 'string',
          },
        },
        required: ['pattern'],
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as {
          absolute_path?: string
          pattern: string
        }
        try {
          const target = resolveWorkspaceTargetPath(context.workspaceRootPath, inputValue.absolute_path)
          return await createGlobToolResult(target.absolutePath, target.relativePath, inputValue.pattern)
        } catch (error) {
          return createToolErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Glob failed.',
          )
        }
      },
    }),
    grep: tool({
      description: 'Search file contents with a regex pattern. Use include to narrow by filename glob.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          absolute_path: {
            type: 'string',
          },
          include: {
            type: 'string',
          },
          pattern: {
            minLength: 1,
            type: 'string',
          },
        },
        required: ['pattern'],
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as {
          absolute_path?: string
          include?: string
          pattern: string
        }
        try {
          const target = resolveWorkspaceTargetPath(context.workspaceRootPath, inputValue.absolute_path)
          return await createGrepToolResult(target.absolutePath, target.relativePath, inputValue.pattern, inputValue.include)
        } catch (error) {
          return createToolErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Search failed.',
          )
        }
      },
    }),
  }

  if (isPlanMode) {
    return tools
  }

  return {
    ...tools,
    apply: wholeFileApplyTool,
    apply_patch: tool({
      description:
        'Apply a structured patch using the Codex-style *** Begin Patch format. Prefer this for targeted edits to existing files.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          patchText: {
            minLength: 1,
            type: 'string',
          },
        },
        required: ['patchText'],
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as { patchText: string }
        try {
          return await createApplyPatchToolResult(context, inputValue.patchText)
        } catch (error) {
          return createToolErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Patch failed.',
          )
        }
      },
    }),
  }
}
