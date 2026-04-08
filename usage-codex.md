# Codex Usage Blueprint

This document describes the request flow used by the `codex-usage` extension so another app or AI agent can reproduce the same behavior.

> Notes
>
> - The endpoints below are inferred from the current extension implementation.
> - They are not part of a public stable API contract.
> - If OpenAI changes the backend, this blueprint may need to be updated.

## What the extension tracks

The extension tracks Codex/ChatGPT quota usage by:

1. Loading local auth JSON from disk.
2. Refreshing tokens when needed.
3. Sending an authenticated GET request to the usage backend.
4. Reading the returned rate-limit windows.
5. Displaying remaining quota in the VS Code status bar.

## End-to-end flow

```text
local auth.json
  -> refresh token if expired
  -> fetch usage snapshot
  -> parse primary/secondary usage windows
  -> render 5h and Week status items
```

## Local auth sources

The extension looks for auth JSON in these places:

- Workspace auth file: `auth.json` next to the extension root
- Codex auth file: `C:\Users\Administrator\.codex\auth.json`

It also stores mirrored accounts in:

- `C:\Users\Administrator\.codex\accounts\<account_id>.json`

### Required auth shape

The auth file must contain at least:

```json
{
  "auth_mode": "chatgpt",
  "OPENAI_API_KEY": null,
  "tokens": {
    "id_token": "...",
    "access_token": "...",
    "refresh_token": "...",
    "account_id": "..."
  },
  "last_refresh": "2025-01-01T00:00:00.000Z"
}
```

## 1) Refresh / bootstrap auth

Before fetching usage, the extension ensures it has a valid auth payload.

### Refresh endpoint

- **URL:** `https://auth.openai.com/oauth/token`
- **Method:** `POST`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Accept:** `application/json`

### Request body

Sent as `URLSearchParams`:

```text
client_id=<client_id>
grant_type=refresh_token
refresh_token=<refresh_token>
scope=openid profile email
```

Where the current client id is:

```text
app_EMoamEEZ73f0CkXaXp7hrann
```

### Success response

The extension expects JSON similar to:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "id_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Refresh handling

If the local auth record is older than the refresh window, the extension:

1. Sends the refresh request.
2. Replaces `access_token`.
3. Replaces `refresh_token` if the server returns a new one.
4. Replaces `id_token` if the server returns a new one.
5. Updates `last_refresh`.
6. Writes the updated auth JSON back to disk.

### Error handling

If the token request fails, the implementation surfaces the HTTP status and error body.
A consuming app should do the same and avoid silently swallowing the failure.

## 2) Decode account identity from `id_token`

The `id_token` is decoded locally to extract identity fields.

### Required claims

The extension uses:

- `email`
- `account_id`

It also supports fallback lookup at:

- `https://api.openai.com/auth.chatgpt_account_id` inside the token payload object

### Why this matters

The decoded `account_id` is used to:

- store the account locally
- set the `ChatGPT-Account-Id` request header for usage fetches
- identify the active account

## 3) Fetch usage snapshot

This is the core usage request.

### Usage endpoint

- **URL:** `https://chatgpt.com/backend-api/wham/usage`
- **Method:** `GET`
- **Accept:** `application/json`

### Request headers

Required:

```http
Authorization: Bearer <access_token>
Accept: application/json
```

Optional but used when available:

```http
ChatGPT-Account-Id: <account_id>
```

### Example request

```http
GET /backend-api/wham/usage HTTP/1.1
Host: chatgpt.com
Authorization: Bearer eyJ...
ChatGPT-Account-Id: 1234567890
Accept: application/json
```

### Expected response shape

The extension expects JSON like:

```json
{
  "plan_type": "...",
  "rate_limit": {
    "primary_window": {
      "used_percent": 42,
      "limit_window_seconds": 18000,
      "reset_after_seconds": 1234,
      "reset_at": 1710000000
    },
    "secondary_window": {
      "used_percent": 17,
      "limit_window_seconds": 604800,
      "reset_after_seconds": 86400,
      "reset_at": 1710000000
    }
  }
}
```

### Important fields

The extension reads:

- `rate_limit.primary_window`
- `rate_limit.secondary_window`

Each window contains:

- `used_percent`
- `limit_window_seconds`
- `reset_after_seconds`
- `reset_at`

### Snapshot interpretation

The extension converts the API response into a simpler snapshot:

- `primary`: the main usage window, or `null`
- `secondary`: the secondary usage window, or `null`

If a secondary window exists, the UI treats:

- `primary` as the 5-hour window
- `secondary` as the weekly window

If there is no secondary window, the UI treats:

- `primary` as the weekly window
- `secondary` as `null`

## 4) Present usage to the user

The extension formats the snapshot into status bar text:

- `Codex 5h: <remaining>%`
- `Codex Week: <remaining>%`

It computes remaining quota as:

```text
remaining = 100 - used_percent
```

It also shows a reset estimate from `reset_after_seconds`.

## Account management behavior

When multiple accounts are stored:

- the active account is discovered from the current auth file
- accounts are listed with their usage snapshot when available
- failed usage fetches for one account do not block the rest
- accounts can be switched or removed

## Suggested blueprint for another app

If you want to port this behavior into a different application, implement the following modules:

### 1. Auth loader

Responsibilities:

- Read one or more auth JSON files from disk.
- Validate the token fields.
- Refresh expired auth using the OAuth token endpoint.
- Persist the updated auth back to disk.

### 2. Usage client

Responsibilities:

- Accept a valid access token and account id.
- Call `GET https://chatgpt.com/backend-api/wham/usage`.
- Attach the bearer token and `ChatGPT-Account-Id` header.
- Parse the returned rate-limit windows into a small domain object.

### 3. UI layer

Responsibilities:

- Show the remaining 5-hour and weekly quota.
- Refresh on startup and on a timer.
- Show errors clearly when auth or usage requests fail.

## Minimal pseudocode

```ts
const auth = await loadAndRefreshAuth();
const usage = await fetchUsageSnapshot(auth);
render({
  fiveHourRemaining: usage.primary ? 100 - usage.primary.used_percent : null,
  weekRemaining: usage.secondary ? 100 - usage.secondary.used_percent : null,
});
```

## Implementation cautions

- Do not hardcode assumptions about the rate-limit windows beyond what the response actually returns.
- Always handle auth refresh failure separately from usage fetch failure.
- Treat the endpoint as unstable and keep the parsing layer defensive.
- Do not rely on undocumented fields unless your app can tolerate them changing.

## Quick reference

### Refresh auth

- `POST https://auth.openai.com/oauth/token`
- Form-encoded body
- Uses `refresh_token`
- Returns new tokens

### Fetch usage

- `GET https://chatgpt.com/backend-api/wham/usage`
- Uses `Authorization: Bearer <access_token>`
- Optionally sends `ChatGPT-Account-Id`
- Returns `rate_limit.primary_window` and `rate_limit.secondary_window`

## If you only need the one request

The usage request itself is:

```http
GET https://chatgpt.com/backend-api/wham/usage
Authorization: Bearer <access_token>
ChatGPT-Account-Id: <account_id>
Accept: application/json
```

Parse the JSON response, read `rate_limit.primary_window` and `rate_limit.secondary_window`, then compute remaining quota from `used_percent`.
