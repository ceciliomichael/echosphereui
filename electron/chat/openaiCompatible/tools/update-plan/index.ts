import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'
import { getToolDescription } from '../descriptionCatalog'
import { parseToolArguments, readRequiredString } from '../filesystemToolUtils'

interface PlanStepInput {
  id: string
  status: 'completed' | 'in_progress' | 'pending'
  title: string
}

const TOOL_DESCRIPTION = getToolDescription('update_plan')
const VALID_STEP_STATUSES = new Set(['pending', 'in_progress', 'completed'])

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

function normalizePlanStep(rawStep: unknown, index: number): PlanStepInput {
  if (typeof rawStep !== 'object' || rawStep === null || Array.isArray(rawStep)) {
    throw new OpenAICompatibleToolError(`steps[${index}] must be an object.`, {
      index,
    })
  }

  const stepRecord = rawStep as Record<string, unknown>
  const id = readRequiredString(stepRecord, 'id')
  const title = readRequiredString(stepRecord, 'title')
  const statusValue = readRequiredString(stepRecord, 'status').toLowerCase()
  if (!VALID_STEP_STATUSES.has(statusValue)) {
    throw new OpenAICompatibleToolError(`steps[${index}].status must be one of pending, in_progress, or completed.`, {
      index,
      status: statusValue,
    })
  }

  return {
    id,
    status: statusValue as PlanStepInput['status'],
    title,
  }
}

function normalizePlanSteps(input: Record<string, unknown>) {
  const rawSteps = input.steps
  if (!Array.isArray(rawSteps)) {
    throw new OpenAICompatibleToolError('steps must be an array.', {
      fieldName: 'steps',
    })
  }

  if (rawSteps.length === 0) {
    throw new OpenAICompatibleToolError('steps must contain at least one plan step.', {
      fieldName: 'steps',
    })
  }

  const normalizedSteps = rawSteps.map((rawStep, index) => normalizePlanStep(rawStep, index))
  const uniqueStepIds = new Set<string>()
  for (const step of normalizedSteps) {
    if (uniqueStepIds.has(step.id)) {
      throw new OpenAICompatibleToolError('steps must use unique ids.', {
        duplicateId: step.id,
      })
    }
    uniqueStepIds.add(step.id)
  }

  return normalizedSteps
}

export const updatePlanTool: OpenAICompatibleToolDefinition = {
  executionMode: 'exclusive',
  name: 'update_plan',
  parseArguments: parseToolArguments,
  async execute(argumentsValue) {
    const planId = readOptionalString(argumentsValue, 'plan') ?? 'default'
    const steps = normalizePlanSteps(argumentsValue)
    const hasIncompleteSteps = steps.some((step) => step.status !== 'completed')
    const inProgressSteps = steps.filter((step) => step.status === 'in_progress')
    const completedStepCount = steps.filter((step) => step.status === 'completed').length
    const pendingStepCount = steps.filter((step) => step.status === 'pending').length
    const inProgressStepCount = inProgressSteps.length

    return {
      allStepsCompleted: !hasIncompleteSteps,
      completedStepCount,
      hasIncompleteSteps,
      inProgressStepCount,
      inProgressStepId: inProgressSteps[0]?.id ?? null,
      inProgressStepIds: inProgressSteps.map((step) => step.id),
      message: `Plan ${planId} updated: ${completedStepCount}/${steps.length} completed.`,
      operation: 'update_plan',
      path: '.',
      pendingStepCount,
      planId,
      steps: steps.map((step) => ({ id: step.id, status: step.status, title: step.title })),
      targetKind: 'plan',
      totalStepCount: steps.length,
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: 'update_plan',
      parameters: {
        additionalProperties: false,
        properties: {
          plan: {
            description: 'Optional short plan title for this run.',
            type: 'string',
          },
          steps: {
            description: 'Ordered workflow steps. Use in_progress for active work; multiple steps may be in_progress at once.',
            items: {
              additionalProperties: false,
              properties: {
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
              required: ['id', 'title', 'status'],
              type: 'object',
            },
            minItems: 1,
            type: 'array',
          },
        },
        required: ['steps'],
        type: 'object',
      },
    },
    type: 'function',
  },
}
