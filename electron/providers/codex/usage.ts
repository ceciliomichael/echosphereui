import type { CodexUsageSnapshot, CodexUsageWindow } from '../../../src/types/chat'

const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'

interface UsageWindowPayload {
  used_percent?: unknown
  usedPercent?: unknown
  limit_window_seconds?: unknown
  limitWindowSeconds?: unknown
  reset_after_seconds?: unknown
  resetAfterSeconds?: unknown
  reset_at?: unknown
  resetAt?: unknown
}

interface UsageResponsePayload {
  rate_limit?: unknown
  rateLimit?: unknown
  primary_window?: unknown
  primaryWindow?: unknown
  hourly_window?: unknown
  hourlyWindow?: unknown
  secondary_window?: unknown
  secondaryWindow?: unknown
  weekly_window?: unknown
  weeklyWindow?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readFiniteNumber(payload: UsageWindowPayload, keys: readonly string[]): number | null {
  const record = payload as Record<string, unknown>

  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return null
}

function parseUsageWindow(input: unknown): CodexUsageWindow | null {
  if (!isRecord(input)) {
    return null
  }

  const payload = input as UsageWindowPayload
  const usedPercent = readFiniteNumber(payload, ['used_percent', 'usedPercent'])
  const limitWindowSeconds = readFiniteNumber(payload, ['limit_window_seconds', 'limitWindowSeconds'])
  const resetAfterSeconds = readFiniteNumber(payload, ['reset_after_seconds', 'resetAfterSeconds'])
  const resetAt = readFiniteNumber(payload, ['reset_at', 'resetAt'])

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
  const rateLimit = isRecord(payload.rate_limit) ? payload.rate_limit : isRecord(payload.rateLimit) ? payload.rateLimit : null

  if (!rateLimit) {
    throw new Error('Usage response is missing rate_limit.')
  }

  const primary =
    parseUsageWindow(rateLimit.primary_window ?? rateLimit.primaryWindow ?? rateLimit.hourly_window ?? rateLimit.hourlyWindow) ??
    null
  const secondary =
    parseUsageWindow(rateLimit.secondary_window ?? rateLimit.secondaryWindow ?? rateLimit.weekly_window ?? rateLimit.weeklyWindow) ??
    null

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
