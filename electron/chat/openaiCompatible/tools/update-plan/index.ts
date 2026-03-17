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

function toStepIdFromTitle(title: string, index: number) {
  const normalizedValue = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalizedValue.length > 0 ? normalizedValue : `step-${index + 1}`
}

function normalizePlanStep(rawStep: unknown, index: number): PlanStepInput {
  if (typeof rawStep !== 'object' || rawStep === null || Array.isArray(rawStep)) {
    throw new OpenAICompatibleToolError(`steps[${index}] must be an object.`, {
      index,
    })
  }

  const stepRecord = rawStep as Record<string, unknown>
  const title = readOptionalString(stepRecord, 'title') ?? readOptionalString(stepRecord, 'step')
  if (!title) {
    throw new OpenAICompatibleToolError(`steps[${index}].title must be a non-empty string.`, {
      index,
    })
  }

  const id = readOptionalString(stepRecord, 'id') ?? toStepIdFromTitle(title, index)
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

function readRawStepsCandidate(input: Record<string, unknown>) {
  const directSteps = input.steps
  if (directSteps !== undefined) {
    return directSteps
  }

  const planAsSteps = input.plan
  if (Array.isArray(planAsSteps) || (typeof planAsSteps === 'object' && planAsSteps !== null)) {
    return planAsSteps
  }

  const alternativeSteps = input.plan_steps
  if (alternativeSteps !== undefined) {
    return alternativeSteps
  }

  const items = input.items
  if (items !== undefined) {
    return items
  }

  const singleStepTitle = readOptionalString(input, 'title') ?? readOptionalString(input, 'step')
  const singleStepStatus = readOptionalString(input, 'status')
  if (singleStepTitle && singleStepStatus) {
    return [
      {
        id: readOptionalString(input, 'id') ?? toStepIdFromTitle(singleStepTitle, 0),
        status: singleStepStatus,
        title: singleStepTitle,
      },
    ]
  }

  return undefined
}

function normalizePlanSteps(input: Record<string, unknown>) {
  const rawSteps = readRawStepsCandidate(input)
  let normalizedRawSteps: unknown[]

  if (Array.isArray(rawSteps)) {
    normalizedRawSteps = rawSteps
  } else if (typeof rawSteps === 'object' && rawSteps !== null) {
    normalizedRawSteps = [rawSteps]
  } else if (typeof rawSteps === 'string') {
    const trimmedValue = rawSteps.trim()
    if (trimmedValue.length === 0) {
      throw new OpenAICompatibleToolError('steps must be an array.', {
        fieldName: 'steps',
        receivedType: 'string',
      })
    }

    let parsedSteps: unknown
    try {
      parsedSteps = JSON.parse(trimmedValue)
    } catch {
      throw new OpenAICompatibleToolError('steps must be an array.', {
        fieldName: 'steps',
        receivedType: 'string',
      })
    }

    if (Array.isArray(parsedSteps)) {
      normalizedRawSteps = parsedSteps
    } else if (typeof parsedSteps === 'object' && parsedSteps !== null) {
      normalizedRawSteps = [parsedSteps]
    } else {
      throw new OpenAICompatibleToolError('steps must be an array.', {
        fieldName: 'steps',
        receivedType: typeof parsedSteps,
      })
    }
  } else {
    throw new OpenAICompatibleToolError('steps must be an array.', {
      fieldName: 'steps',
      receivedType: rawSteps === null ? 'null' : typeof rawSteps,
    })
  }

  if (normalizedRawSteps.length === 0) {
    throw new OpenAICompatibleToolError('steps must contain at least one plan step.', {
      fieldName: 'steps',
    })
  }

  const normalizedSteps = normalizedRawSteps.map((rawStep, index) => normalizePlanStep(rawStep, index))
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

function readPlanId(input: Record<string, unknown>) {
  const rawPlan = input.plan
  if (typeof rawPlan !== 'string') {
    return 'default'
  }

  const normalizedPlan = rawPlan.trim()
  return normalizedPlan.length > 0 ? normalizedPlan : 'default'
}

export const updatePlanTool: OpenAICompatibleToolDefinition = {
  executionMode: 'exclusive',
  name: 'update_plan',
  parseArguments: parseToolArguments,
  async execute(argumentsValue) {
    const planId = readPlanId(argumentsValue)
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
