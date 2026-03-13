import type { CodexUsageSnapshot, CodexUsageWindow } from '../../../src/types/chat'

const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'

interface UsageWindowPayload {
  used_percent?: unknown
  limit_window_seconds?: unknown
  reset_after_seconds?: unknown
  reset_at?: unknown
}

interface UsageResponsePayload {
  rate_limit?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseUsageWindow(input: unknown): CodexUsageWindow | null {
  if (!isRecord(input)) {
    return null
  }

  const payload = input as UsageWindowPayload
  const usedPercent = typeof payload.used_percent === 'number' && Number.isFinite(payload.used_percent) ? payload.used_percent : null
  const limitWindowSeconds =
    typeof payload.limit_window_seconds === 'number' && Number.isFinite(payload.limit_window_seconds)
      ? payload.limit_window_seconds
      : null
  const resetAfterSeconds =
    typeof payload.reset_after_seconds === 'number' && Number.isFinite(payload.reset_after_seconds)
      ? payload.reset_after_seconds
      : null
  const resetAt = typeof payload.reset_at === 'number' && Number.isFinite(payload.reset_at) ? payload.reset_at : null

  if (usedPercent === null || limitWindowSeconds === null || resetAfterSeconds === null || resetAt === null) {
    return null
  }

  return {
    usedPercent,
    limitWindowSeconds,
    resetAfterSeconds,
    resetAt,
  }
}

function parseUsageResponse(input: unknown): { primary: CodexUsageWindow | null; secondary: CodexUsageWindow | null } {
  if (!isRecord(input)) {
    throw new Error('Usage response was not a JSON object.')
  }

  const payload = input as UsageResponsePayload
  if (!isRecord(payload.rate_limit)) {
    throw new Error('Usage response is missing rate_limit.')
  }

  const rateLimit = payload.rate_limit as Record<string, unknown>
  const primary = parseUsageWindow(rateLimit.primary_window)
  const secondary = parseUsageWindow(rateLimit.secondary_window)

  return { primary, secondary }
}

export async function fetchCodexUsageSnapshot(input: {
  accessToken: string
  accountId: string
  signal?: AbortSignal
}): Promise<CodexUsageSnapshot> {
  const response = await fetch(CODEX_USAGE_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
      'ChatGPT-Account-Id': input.accountId,
    },
    signal: input.signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Codex usage request failed (${response.status}): ${errorText}`)
  }

  const parsed = parseUsageResponse((await response.json()) as unknown)
  return {
    fetchedAt: new Date().toISOString(),
    primary: parsed.primary,
    secondary: parsed.secondary,
  }
}
