import assert from 'node:assert/strict'
import test from 'node:test'
import { isRateLimitError, retryRateLimitedRequest } from '../../electron/chat/rateLimitRetry'

test('isRateLimitError detects status 429', () => {
  assert.equal(isRateLimitError({ status: 429 }), true)
  assert.equal(isRateLimitError({ response: { status: 429 } }), true)
})

test('retryRateLimitedRequest retries a 429 failure before succeeding', async () => {
  let attemptCount = 0

  const result = await retryRateLimitedRequest(
    async () => {
      attemptCount += 1
      if (attemptCount < 3) {
        const error = new Error('Too Many Requests')
        ;(error as Error & { status?: number }).status = 429
        throw error
      }

      return 'ok'
    },
    {
      initialDelayMs: 0,
      maxRetries: 2,
    },
  )

  assert.equal(result, 'ok')
  assert.equal(attemptCount, 3)
})

test('retryRateLimitedRequest does not retry non-rate-limit failures', async () => {
  let attemptCount = 0

  await assert.rejects(
    retryRateLimitedRequest(
      async () => {
        attemptCount += 1
        throw new Error('Unexpected failure')
      },
      {
        initialDelayMs: 0,
        maxRetries: 2,
      },
    ),
    /Unexpected failure/,
  )

  assert.equal(attemptCount, 1)
})

test('retryRateLimitedRequest can stop retrying after stream progress has started', async () => {
  let attemptCount = 0
  let hasStreamProgress = false

  await assert.rejects(
    retryRateLimitedRequest(
      async () => {
        attemptCount += 1
        hasStreamProgress = true
        const error = new Error('Too Many Requests')
        ;(error as Error & { status?: number }).status = 429
        throw error
      },
      {
        initialDelayMs: 0,
        maxRetries: 2,
        shouldRetryError: (error) => !hasStreamProgress && isRateLimitError(error),
      },
    ),
    /Too Many Requests/,
  )

  assert.equal(attemptCount, 1)
})
