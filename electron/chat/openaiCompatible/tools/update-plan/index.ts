import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'
import { getToolDescription } from '../descriptionCatalog'
import { parseToolArguments, readRequiredString } from '../filesystemToolUtils'

interface TodoItemInput {
  content: string
  id: string
  status: 'completed' | 'in_progress' | 'pending'
  title: string
}

const TOOL_DESCRIPTION = getToolDescription('todo_write')
const VALID_ITEM_STATUSES = new Set(['pending', 'in_progress', 'completed'])

function readOptionalString(input: Record<string, unknown>, fieldName: string) {
  const value = input[fieldName]
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new OpenAICompatibleToolError(`${fieldName} must be a string when provided.`, {
      fieldName,
      receivedType: typeof value,
    })
  }

  const trimmedValue = value.trim()
  if (trimmedValue.length === 0) {
    return undefined
  }

  return trimmedValue
}

function toItemIdFromContent(content: string, index: number) {
  const normalizedValue = content
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalizedValue.length > 0 ? normalizedValue : `item-${index + 1}`
}

function normalizeTodoItem(rawItem: unknown, index: number): TodoItemInput {
  if (typeof rawItem !== 'object' || rawItem === null || Array.isArray(rawItem)) {
    throw new OpenAICompatibleToolError(`tasks[${index}] must be an object.`, {
      index,
    })
  }

  const itemRecord = rawItem as Record<string, unknown>
  const content = readOptionalString(itemRecord, 'content') ?? readOptionalString(itemRecord, 'title') ?? readOptionalString(itemRecord, 'step')
  if (!content) {
    throw new OpenAICompatibleToolError(`tasks[${index}].content must be a non-empty string.`, {
      index,
    })
  }

  const id = readOptionalString(itemRecord, 'id') ?? toItemIdFromContent(content, index)
  const statusValue = readRequiredString(itemRecord, 'status').toLowerCase()
  if (!VALID_ITEM_STATUSES.has(statusValue)) {
    throw new OpenAICompatibleToolError(`tasks[${index}].status must be one of pending, in_progress, or completed.`, {
      index,
      status: statusValue,
    })
  }

  return {
    content,
    id,
    status: statusValue as TodoItemInput['status'],
    title: content,
  }
}

function readRawTasksCandidate(input: Record<string, unknown>) {
  const directTasks = input.tasks
  if (directTasks !== undefined) {
    return directTasks
  }

  const directSteps = input.steps
  if (directSteps !== undefined) {
    return directSteps
  }

  const planAsTasks = input.plan
  if (Array.isArray(planAsTasks) || (typeof planAsTasks === 'object' && planAsTasks !== null)) {
    return planAsTasks
  }

  const alternativeTasks = input.plan_steps
  if (alternativeTasks !== undefined) {
    return alternativeTasks
  }

  const items = input.items
  if (items !== undefined) {
    return items
  }

  const singleTaskContent = readOptionalString(input, 'content') ?? readOptionalString(input, 'title') ?? readOptionalString(input, 'step')
  const singleTaskStatus = readOptionalString(input, 'status')
  if (singleTaskContent && singleTaskStatus) {
    return [
      {
        content: singleTaskContent,
        id: readOptionalString(input, 'id') ?? toItemIdFromContent(singleTaskContent, 0),
        status: singleTaskStatus,
        title: singleTaskContent,
      },
    ]
  }

  return undefined
}

function normalizeTodoTasks(input: Record<string, unknown>) {
  const rawTasks = readRawTasksCandidate(input)
  let normalizedRawTasks: unknown[]

  if (Array.isArray(rawTasks)) {
    normalizedRawTasks = rawTasks
  } else if (typeof rawTasks === 'object' && rawTasks !== null) {
    normalizedRawTasks = [rawTasks]
  } else if (typeof rawTasks === 'string') {
    const trimmedValue = rawTasks.trim()
    if (trimmedValue.length === 0) {
      throw new OpenAICompatibleToolError('tasks must be an array.', {
        fieldName: 'tasks',
        receivedType: 'string',
      })
    }

    let parsedTasks: unknown
    try {
      parsedTasks = JSON.parse(trimmedValue)
    } catch {
      throw new OpenAICompatibleToolError('tasks must be an array.', {
        fieldName: 'tasks',
        receivedType: 'string',
      })
    }

    if (Array.isArray(parsedTasks)) {
      normalizedRawTasks = parsedTasks
    } else if (typeof parsedTasks === 'object' && parsedTasks !== null) {
      normalizedRawTasks = [parsedTasks]
    } else {
      throw new OpenAICompatibleToolError('tasks must be an array.', {
        fieldName: 'tasks',
        receivedType: typeof parsedTasks,
      })
    }
  } else {
    throw new OpenAICompatibleToolError('tasks must be an array.', {
      fieldName: 'tasks',
      receivedType: rawTasks === null ? 'null' : typeof rawTasks,
    })
  }

  if (normalizedRawTasks.length === 0) {
    throw new OpenAICompatibleToolError('tasks must contain at least one todo item.', {
      fieldName: 'tasks',
    })
  }

  const normalizedTasks = normalizedRawTasks.map((rawTask, index) => normalizeTodoItem(rawTask, index))
  const uniqueTaskIds = new Set<string>()
  for (const task of normalizedTasks) {
    if (uniqueTaskIds.has(task.id)) {
      throw new OpenAICompatibleToolError('tasks must use unique ids.', {
        duplicateId: task.id,
      })
    }
    uniqueTaskIds.add(task.id)
  }

  return normalizedTasks
}

function readTodoListId(input: Record<string, unknown>) {
  const rawSessionKey = input.sessionKey
  if (typeof rawSessionKey === 'string') {
    const normalizedSessionKey = rawSessionKey.trim()
    if (normalizedSessionKey.length > 0) {
      return normalizedSessionKey
    }
  }

  const rawPlan = input.plan
  if (typeof rawPlan !== 'string') {
    return 'default'
  }

  const normalizedPlan = rawPlan.trim()
  return normalizedPlan.length > 0 ? normalizedPlan : 'default'
}

export const todoWriteTool: OpenAICompatibleToolDefinition = {
  executionMode: 'exclusive',
  name: 'todo_write',
  parseArguments: parseToolArguments,
  async execute(argumentsValue) {
    const todoListId = readTodoListId(argumentsValue)
    const tasks = normalizeTodoTasks(argumentsValue)
    const hasIncompleteTasks = tasks.some((task) => task.status !== 'completed')
    const inProgressTasks = tasks.filter((task) => task.status === 'in_progress')
    const completedTaskCount = tasks.filter((task) => task.status === 'completed').length
    const pendingTaskCount = tasks.filter((task) => task.status === 'pending').length
    const inProgressTaskCount = inProgressTasks.length

    return {
      allStepsCompleted: !hasIncompleteTasks,
      completedStepCount: completedTaskCount,
      hasIncompleteSteps: hasIncompleteTasks,
      inProgressStepCount: inProgressTaskCount,
      inProgressStepId: inProgressTasks[0]?.id ?? null,
      inProgressStepIds: inProgressTasks.map((task) => task.id),
      message: `Todo list ${todoListId} updated: ${completedTaskCount}/${tasks.length} completed.`,
      operation: 'todo_write',
      path: '.',
      pendingStepCount: pendingTaskCount,
      planId: todoListId,
      sessionKey: todoListId,
      steps: tasks.map((task) => ({ id: task.id, status: task.status, title: task.title })),
      tasks: tasks.map((task) => ({
        content: task.content,
        id: task.id,
        status: task.status,
        title: task.title,
      })),
      targetKind: 'plan',
      totalStepCount: tasks.length,
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: 'todo_write',
      parameters: {
        additionalProperties: false,
        properties: {
          sessionKey: {
            description: 'Optional short key for the todo list session.',
            type: 'string',
          },
          plan: {
            description: 'Optional short todo list title for this run.',
            type: 'string',
          },
          tasks: {
            description: 'Ordered todo items. Use in_progress for active work; multiple tasks may be in_progress at once.',
            items: {
              additionalProperties: false,
              properties: {
                content: {
                  type: 'string',
                },
                id: {
                  type: 'string',
                },
                status: {
                  enum: ['pending', 'in_progress', 'completed'],
                  type: 'string',
                },
              },
              required: ['id', 'content', 'status'],
              type: 'object',
            },
            minItems: 1,
            type: 'array',
          },
          steps: {
            description: 'Legacy alias for tasks. Use in_progress for active work; multiple tasks may be in_progress at once.',
            items: {
              additionalProperties: false,
              properties: {
                content: {
                  type: 'string',
                },
                id: {
                  type: 'string',
                },
                status: {
                  enum: ['pending', 'in_progress', 'completed'],
                  type: 'string',
                },
                title: {
                  type: 'string',
                },
              },
              required: ['id', 'status'],
              type: 'object',
            },
            minItems: 1,
            type: 'array',
          },
        },
        required: ['tasks'],
        type: 'object',
      },
    },
    type: 'function',
  },
}
