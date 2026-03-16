import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'
import type { ToolDecisionOption } from '../../../../../src/types/chat'
import { getToolDescription } from '../descriptionCatalog'
import { parseToolArguments } from '../filesystemToolUtils'

const TOOL_DESCRIPTION = getToolDescription('ask_question')

function readRequiredQuestion(argumentsValue: Record<string, unknown>) {
  const question = argumentsValue.question
  if (typeof question !== 'string' || question.trim().length === 0) {
    throw new OpenAICompatibleToolError('question is required and must be a non-empty string.', {
      fieldName: 'question',
    })
  }

  return question.trim()
}

function readOptionRecord(rawOption: unknown, index: number): ToolDecisionOption {
  if (typeof rawOption !== 'object' || rawOption === null || Array.isArray(rawOption)) {
    throw new OpenAICompatibleToolError('Each option must be an object with id and label.', {
      index,
    })
  }

  const optionRecord = rawOption as Record<string, unknown>
  const id = optionRecord.id
  const label = optionRecord.label

  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new OpenAICompatibleToolError('Each option.id must be a non-empty string.', {
      index,
    })
  }

  if (typeof label !== 'string' || label.trim().length === 0) {
    throw new OpenAICompatibleToolError('Each option.label must be a non-empty string.', {
      index,
    })
  }

  return {
    id: id.trim(),
    label: label.trim(),
  }
}

function readOptions(argumentsValue: Record<string, unknown>) {
  const options = argumentsValue.options
  if (!Array.isArray(options)) {
    throw new OpenAICompatibleToolError('options is required and must be an array.', {
      fieldName: 'options',
    })
  }

  if (options.length < 2 || options.length > 3) {
    throw new OpenAICompatibleToolError('options must contain 2 or 3 choices.', {
      optionCount: options.length,
    })
  }

  const normalizedOptions = options.map((rawOption, index) => readOptionRecord(rawOption, index))
  const uniqueOptionIds = new Set(normalizedOptions.map((option) => option.id))
  if (uniqueOptionIds.size !== normalizedOptions.length) {
    throw new OpenAICompatibleToolError('options must have unique ids.', {})
  }

  return normalizedOptions
}

function readAllowCustomAnswer(argumentsValue: Record<string, unknown>) {
  const allowCustomAnswer = argumentsValue.allow_custom_answer
  if (allowCustomAnswer === undefined) {
    return true
  }

  if (typeof allowCustomAnswer !== 'boolean') {
    throw new OpenAICompatibleToolError('allow_custom_answer must be a boolean when provided.', {
      fieldName: 'allow_custom_answer',
    })
  }

  return allowCustomAnswer
}

export const askQuestionTool: OpenAICompatibleToolDefinition = {
  executionMode: 'exclusive',
  name: 'ask_question',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const question = readRequiredQuestion(argumentsValue)
    const options = readOptions(argumentsValue)
    const allowCustomAnswer = readAllowCustomAnswer(argumentsValue)
    const requestUserDecision = context.requestUserDecision
    if (!requestUserDecision) {
      throw new OpenAICompatibleToolError('ask_question requires user decision support in the current runtime.')
    }

    const userDecision = await requestUserDecision({
      allowCustomAnswer,
      kind: 'ask_question',
      options,
      prompt: question,
    })

    return {
      allowCustomAnswer,
      answerText: userDecision.answerText,
      message: 'User answered the planning question.',
      operation: 'ask_question',
      options,
      prompt: question,
      selectedOptionId: userDecision.selectedOptionId,
      selectedOptionLabel: userDecision.selectedOptionLabel,
      usedCustomAnswer: userDecision.usedCustomAnswer,
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: 'ask_question',
      parameters: {
        additionalProperties: false,
        properties: {
          allow_custom_answer: {
            description: 'Allow a custom free-form answer in addition to the listed options. Defaults to true.',
            type: 'boolean',
          },
          options: {
            description: 'Two or three answer options presented to the user.',
            items: {
              additionalProperties: false,
              properties: {
                id: {
                  description: 'Stable option id used in the tool result.',
                  type: 'string',
                },
                label: {
                  description: 'User-facing option label.',
                  type: 'string',
                },
              },
              required: ['id', 'label'],
              type: 'object',
            },
            maxItems: 3,
            minItems: 2,
            type: 'array',
          },
          question: {
            description: 'The question text shown to the user.',
            type: 'string',
          },
        },
        required: ['question', 'options'],
        type: 'object',
      },
    },
    type: 'function',
  },
}
