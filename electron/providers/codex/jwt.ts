import { Buffer } from 'node:buffer'

interface CodexIdTokenClaims {
  account_id?: string
  accountId?: string
  email?: string
  exp?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeBase64Url(input: string) {
  const encoded = input.replace(/-/g, '+').replace(/_/g, '/')
  const missingPadding = encoded.length % 4

  if (missingPadding === 0) {
    return encoded
  }

  return `${encoded}${'='.repeat(4 - missingPadding)}`
}

export function parseCodexIdTokenClaims(idToken: string): {
  accountId: string | null
  email: string | null
  expiresAt: string | null
} {
  const parts = idToken.split('.')
  if (parts.length < 2) {
    return {
      accountId: null,
      email: null,
      expiresAt: null,
    }
  }

  try {
    const payload = Buffer.from(normalizeBase64Url(parts[1]), 'base64').toString('utf8')
    const claimsCandidate = JSON.parse(payload) as unknown

    if (!isRecord(claimsCandidate)) {
      return {
        accountId: null,
        email: null,
        expiresAt: null,
      }
    }

    const claims = claimsCandidate as CodexIdTokenClaims
    const accountId =
      typeof claims.account_id === 'string'
        ? claims.account_id
        : typeof claims.accountId === 'string'
          ? claims.accountId
          : null
    const email = typeof claims.email === 'string' ? claims.email : null
    const expiresAt =
      typeof claims.exp === 'number' && Number.isFinite(claims.exp)
        ? new Date(claims.exp * 1000).toISOString()
        : null

    return {
      accountId,
      email,
      expiresAt,
    }
  } catch {
    return {
      accountId: null,
      email: null,
      expiresAt: null,
    }
  }
}
