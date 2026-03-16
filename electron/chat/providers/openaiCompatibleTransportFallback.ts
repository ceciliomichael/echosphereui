function readErrorStatus(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const record = error as Record<string, unknown>
  const status = record.status
  return typeof status === 'number' ? status : null
}

export function shouldFallbackToChatCompletions(error: unknown) {
  const status = readErrorStatus(error)
  if (status !== null && ![400, 404, 405, 410, 422, 501].includes(status)) {
    return false
  }

  let message = ''
  if (error instanceof Error) {
    message = error.message.toLowerCase()
  } else if (typeof error === 'object' && error !== null) {
    const candidateMessage = (error as Record<string, unknown>).message
    if (typeof candidateMessage === 'string') {
      message = candidateMessage.toLowerCase()
    }
  }

  return (
    message.includes('/responses') ||
    message.includes('responses api') ||
    message.includes('unknown url') ||
    message.includes('not found') ||
    message.includes('unsupported')
  )
}
