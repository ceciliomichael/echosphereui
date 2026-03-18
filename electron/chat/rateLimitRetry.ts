const DEFAULT_MAX_RETRIES = 2
const DEFAULT_INITIAL_DELAY_MS = 750

function readErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const record = error as Record<string, unknown>
  const statusCandidates = [record.status, record.statusCode]

  for (const statusCandidate of statusCandidates) {
    if (typeof statusCandidate === 'number') {
      return statusCandidate
    }
  }

  const response = record.response
  if (typeof response === 'object' && response !== null) {
    const responseStatus = (response as Record<string, unknown>).status
    if (typeof responseStatus === 'number') {
      return responseStatus
    }
  }

  return null
}

export function isRateLimitError(error: unknown) {
  const status = readErrorStatus(error)
  if (status === 429) {
    return true
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>).message === 'string'
        ? ((error as Record<string, unknown>).message as string)
        : ''

  const normalizedMessage = message.toLowerCase()
  return normalizedMessage.includes('429') || normalizedMessage.includes('rate limit') || normalizedMessage.includes('too many requests')
}

async function waitForDelay(delayMs: number, signal?: AbortSignal) {
  if (delayMs <= 0) {
    return
  }

  if (signal?.aborted) {
    throw new Error('Request was aborted before the retry could be attempted.')
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup()
      resolve()
    }, delayMs)

    const abortHandler = () => {
      cleanup()
      reject(new Error('Request was aborted before the retry could be attempted.'))
    }

    const cleanup = () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', abortHandler)
    }

    signal?.addEventListener('abort', abortHandler, { once: true })
  })
}

export async function retryRateLimitedRequest<T>(
  operation: () => Promise<T>,
  options: {
    initialDelayMs?: number
    maxRetries?: number
    shouldRetryError?: (error: unknown) => boolean
    signal?: AbortSignal
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS
  const shouldRetryError = options.shouldRetryError ?? isRateLimitError

  let attempt = 0
  let delayMs = initialDelayMs

  while (true) {
    if (options.signal?.aborted) {
      throw new Error('Request was aborted before it started.')
    }

    try {
      return await operation()
    } catch (error) {
      if (attempt >= maxRetries || !shouldRetryError(error)) {
        throw error
      }

      attempt += 1
      await waitForDelay(delayMs, options.signal)
      delayMs *= 2
    }
  }
}
