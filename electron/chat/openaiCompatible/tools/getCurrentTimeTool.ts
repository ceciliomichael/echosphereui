import type { OpenAICompatibleToolDefinition } from '../toolTypes'

function parseArguments(argumentsText: string) {
  if (argumentsText.trim().length === 0) {
    return {}
  }

  const parsedValue = JSON.parse(argumentsText) as unknown
  if (typeof parsedValue !== 'object' || parsedValue === null || Array.isArray(parsedValue)) {
    throw new Error('get_current_time arguments must be a JSON object.')
  }

  // Some models/providers still send harmless extra fields for zero-arg tools.
  // Ignore them instead of failing the whole tool step.
  return parsedValue as Record<string, unknown>
}

export const getCurrentTimeTool: OpenAICompatibleToolDefinition = {
  async execute() {
    const now = new Date()
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

    return {
      isoTimestamp: now.toISOString(),
      localDate: now.toLocaleDateString(),
      localDateTime: now.toLocaleString(),
      localTime: now.toLocaleTimeString(),
      timezone,
      unixMilliseconds: now.getTime(),
      unixSeconds: Math.floor(now.getTime() / 1000),
    }
  },
  name: 'get_current_time',
  parseArguments,
  tool: {
    function: {
      description:
        'Get the current local date and time for the machine running this app. This tool requires no arguments.',
      name: 'get_current_time',
      parameters: {
        additionalProperties: true,
        properties: {},
        type: 'object',
      },
    },
    type: 'function',
  },
}
