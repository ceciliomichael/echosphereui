import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'
import { getToolDescription } from '../descriptionCatalog'
import { parseToolArguments } from '../filesystemToolUtils'

type ReadyImplementOptionId = 'no_modify' | 'yes_implement'

interface ReadyImplementOption {
  id: ReadyImplementOptionId
  label: string
}

const DEFAULT_PROMPT = 'Ready to implement this plan?'
const DEFAULT_YES_LABEL = 'Yes, implement the plan'
const DEFAULT_NO_LABEL = 'No, I still have modifications for the plan'
const TOOL_DESCRIPTION = getToolDescription('ready_implement')

function readOptionalNonEmptyString(input: Record<string, unknown>, fieldName: string) {
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

function buildDefaultOptions(yesLabel: string, noLabel: string): ReadyImplementOption[] {
  return [
    {
      id: 'yes_implement',
      label: yesLabel,
    },
    {
      id: 'no_modify',
      label: noLabel,
    },
  ]
}

export const readyImplementTool: OpenAICompatibleToolDefinition = {
  executionMode: 'exclusive',
  name: 'ready_implement',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const prompt = readOptionalNonEmptyString(argumentsValue, 'prompt') ?? DEFAULT_PROMPT
    const yesLabel = readOptionalNonEmptyString(argumentsValue, 'yes_label') ?? DEFAULT_YES_LABEL
    const noLabel = readOptionalNonEmptyString(argumentsValue, 'no_label') ?? DEFAULT_NO_LABEL
    const options = buildDefaultOptions(yesLabel, noLabel)
    const requestUserDecision = context.requestUserDecision
    if (!requestUserDecision) {
      throw new OpenAICompatibleToolError('ready_implement requires user decision support in the current runtime.')
    }

    const userDecision = await requestUserDecision({
      allowCustomAnswer: false,
      kind: 'ready_implement',
      options,
      prompt,
    })
    const selectedOptionId = userDecision.selectedOptionId as ReadyImplementOptionId | null
    const selectedOptionLabel = userDecision.selectedOptionLabel
    const shouldImplement = selectedOptionId === 'yes_implement'

    return {
      answerText: userDecision.answerText,
      message: shouldImplement
        ? 'User approved implementation. Proceeding in Agent mode.'
        : 'User requested plan changes. Remaining in Plan mode.',
      nextChatMode: shouldImplement ? 'agent' : 'plan',
      operation: 'ready_implement',
      options,
      prompt,
      selectedOptionId,
      selectedOptionLabel,
      targetKind: 'implementation_gate',
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: 'ready_implement',
      parameters: {
        additionalProperties: false,
        properties: {
          no_label: {
            description: 'Optional override label for the no/needs-modification option.',
            type: 'string',
          },
          prompt: {
            description: 'Optional prompt text to display above the approval options.',
            type: 'string',
          },
          yes_label: {
            description: 'Optional override label for the yes/implement option.',
            type: 'string',
          },
        },
        type: 'object',
      },
    },
    type: 'function',
  },
}
