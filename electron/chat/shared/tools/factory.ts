import { jsonSchema, tool, type ToolSet } from 'ai'
import type { ChatMode } from '../../../../src/types/chat'
import type { SkillSummary } from '../../../../src/types/skills'
import { buildLoadedSkillResult, buildSkillToolDescription, loadEnabledSkillByName } from '../../../skills/service'
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
import { createTerminalToolSet } from './terminalTools'

function createToolErrorResult(summary: string, body?: string): AgentToolExecutionResult {
  return {
    ...(body ? { body } : {}),
    status: 'error',
    summary,
  }
}

export async function createAgentTools(
  input: AgentToolContext,
  options?: { chatMode?: ChatMode; enabledSkills?: SkillSummary[] },
): Promise<ToolSet> {
  const context = await createToolContext(input)
  const wholeFileApplyTool = createWholeFileApplyTool(context)
  const isPlanMode = options?.chatMode === 'plan'
  const enabledSkills = options?.enabledSkills ?? []
  const tools: ToolSet = {
    list: tool({
      description:
        'List the immediate contents of a workspace directory. Use this to orient yourself, discover nearby files, and decide what to read next. Treat it as a discovery step, not a substitute for reading source.',
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
      description:
        'Read a UTF-8 text file with numbered lines. Use this after locating candidate files with list, glob, or grep, and read the actual file before patching. Use offset to continue large files.',
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
      description:
        'Find files by glob pattern within the workspace. Use this to discover likely file paths when you know the naming shape or directory layout, then read the matched files before editing.',
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
          return await createGlobToolResult(context.workspaceRootPath, target.absolutePath, target.relativePath, inputValue.pattern)
        } catch (error) {
          return createToolErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Glob failed.',
          )
        }
      },
    }),
    grep: tool({
      description:
        'Fast content search tool for visible workspace files. Use it to locate relevant files, symbols, or strings, then read the matching files before editing or patching. Treat grep results as pointers only. Prefer a narrow absolute_path, keep patterns specific, and use include to narrow by filename glob. Searches file contents with regular expressions and skips repository metadata such as .git.',
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
          return await createGrepToolResult(
            context.workspaceRootPath,
            target.absolutePath,
            target.relativePath,
            inputValue.pattern,
            inputValue.include,
          )
        } catch (error) {
          return createToolErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Search failed.',
          )
        }
      },
    }),
  }

  if (enabledSkills.length > 0) {
    tools.skill = tool({
      description: buildSkillToolDescription(enabledSkills),
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          name: {
            enum: enabledSkills.map((skill) => skill.name),
            type: 'string',
          },
        },
        required: ['name'],
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as { name: string }
        try {
          const loadedSkill = await loadEnabledSkillByName(inputValue.name, context.workspaceRootPath, enabledSkills)
          if (!loadedSkill) {
            return createToolErrorResult(
              `Skill "${inputValue.name}" is unavailable.`,
              `Available skills: ${enabledSkills.map((skill) => skill.name).join(', ') || 'none'}`,
            )
          }

          return buildLoadedSkillResult(loadedSkill)
        } catch (error) {
          return createToolErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Unable to load the skill.',
          )
        }
      },
    })
  }

  try {
    const isElectronRuntime = typeof process !== 'undefined' && Boolean(process.versions.electron)
    if (isElectronRuntime) {
      const { getMcpServerManager } = await import('../../../mcp/serverManager')
      const mcpTools = await getMcpServerManager().getToolSet(context.workspaceRootPath)
      Object.assign(tools, mcpTools)
    }
  } catch (error) {
    console.error('Failed to load MCP tools', error)
  }

  if (isPlanMode) {
    return tools
  }

  return {
    ...tools,
    ...createTerminalToolSet(input),
    apply: wholeFileApplyTool,
    apply_patch: tool({
      description:
        'Apply a structured patch using the Codex-style *** Begin Patch format. Use this after reading the target file(s) and confirming the exact edit. Prefer this for targeted changes to existing files.',
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
