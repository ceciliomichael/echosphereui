# Codex Proxy Explanation

This document explains how `CLIProxyAPI` implements OAuth authorization and calls the upstream OpenAI Codex backend. You can use this information to build your own standalone Codex proxy.

If you want to call the Codex backend directly without the chat-completions compatibility layer, see [direct_responses_api_guide.md](direct_responses_api_guide.md).

## Scope Boundary

This proxy targets an internal Codex backend contract (`https://chatgpt.com/backend-api/codex/...`), not the public `https://api.openai.com/v1/responses` contract.

- Public Responses state features such as `conversation` and `previous_response_id` are not the primary state path in this proxy.
- `thread_id` belongs to the legacy Assistants API surface, not modern Responses-native state.
- This proxy keeps conversational state by transforming and resending chat history as Codex `input` items.
- The local `/v1/responses` route in this proxy accepts OpenAI-compatible chat-style payloads and translates them before upstream delivery.

## 1. OAuth Authorization Flow

The authentication relies on OpenAI's standard OAuth2 workflow, combined with PKCE (Proof Key for Code Exchange) to secure the flow for public clients. 

### Key Constants
- **Auth URL:** `https://auth.openai.com/oauth/authorize`
- **Token URL:** `https://auth.openai.com/oauth/token`
- **Client ID:** `app_EMoamEEZ73f0CkXaXp7hrann` (This is the specific client ID used for Codex CLI).
- **Redirect URI:** `http://localhost:1455/auth/callback` (Can be modified if handling device flow/alternate redirect).

### Step 1: Generating the Authorization URL
To prompt the user for login, you must generate a PKCE code verifier and code challenge, then redirect the user to the `AuthURL` with the following URL query parameters:
- `client_id`: `app_EMoamEEZ73f0CkXaXp7hrann`
- `response_type`: `code`
- `redirect_uri`: `http://localhost:1455/auth/callback`
- `scope`: `openid email profile offline_access`
- `state`: `<random_state_string>`
- `code_challenge`: `<pkce_code_challenge>`
- `code_challenge_method`: `S256`
- `prompt`: `login`
- `id_token_add_organizations`: `true`
- `codex_cli_simplified_flow`: `true`

### Step 2: Exchanging the Code for Tokens
Once the user authorizes, they are redirected to your `redirect_uri` with a `code`. You exchange this code via a `POST` request to the `TokenURL`:

**Request Headers:**
- `Content-Type: application/x-www-form-urlencoded`
- `Accept: application/json`

**Form Data:**
- `grant_type`: `authorization_code`
- `client_id`: `app_EMoamEEZ73f0CkXaXp7hrann`
- `code`: `<authorization_code_received>`
- `redirect_uri`: `http://localhost:1455/auth/callback`
- `code_verifier`: `<pkce_code_verifier>`

The response will contain:
`access_token`, `refresh_token`, `id_token`, and `expires_in`. 

> **Note:** The `id_token` is a JWT. Parsing it allows you to extract the user's `account_id` and `email`.

### Step 3: Refreshing Tokens
When an `access_token` expires, make a `POST` request to the `TokenURL`.

**Form Data:**
- `client_id`: `app_EMoamEEZ73f0CkXaXp7hrann`
- `grant_type`: `refresh_token`
- `refresh_token`: `<your_refresh_token>`
- `scope`: `openid profile email`

---

## 2. Upstream Backend Calls

The Codex backend is accessed via the `https://chatgpt.com/backend-api/codex` endpoints.

### Endpoints
- **Stream/Standard Responses:** `POST https://chatgpt.com/backend-api/codex/responses`
- **Compact Responses (Non-Streaming):** `POST https://chatgpt.com/backend-api/codex/responses/compact`

### Required HTTP Headers
To successfully proxy the API request to the upstream target, your HTTP requests must include these specific headers:

- `Authorization`: `Bearer <access_token>` (The access token obtained via OAuth)
- `Content-Type`: `application/json`
- `Accept`: `text/event-stream` (for streaming) or `application/json` (for compact)
- `Version`: `0.101.0`
- `User-Agent`: `codex_cli_rs/0.101.0 (Windows; x86_64)`
- `Session_id`: A randomly generated UUID for each request (`uuid.NewString()`).
- `Originator`: `codex_cli_rs`
- `Chatgpt-Account-Id`: `<account_id>` (Extracted from the `id_token` during auth).

### Caching Headers (Optional)
If you wish to use prompt caching logic, you can pass:
- `Conversation_id`: `<cache_uuid>`
- `Session_id`: `<cache_uuid>`

### Payload Adjustments
Before forwarding the JSON body to OpenAI, the CLIProxyAPI cleans it up:
1. Translates the generic OpenAI Chat payload into Codex-specific JSON.
2. Removes fields that Codex might reject: `previous_response_id`, `prompt_cache_retention`, `safety_identifier`.
3. Ensures the `model` key carries the correct base model name (e.g. `gpt-4o`).
4. Ensures `stream` is `true` for standard responses, and `false` for `/responses/compact`.
5. Ensures an `instructions` key exists, defaulting to `""` if not.

#### Generation Parameters & Reasoning Effort
There are key differences with generation logic specifically for the Responses API:
- **Ignored Parameters (`max_tokens`, etc.):** Codex does *not* support several typical generation parameters. The CLIProxyAPI entirely strips out `max_tokens`, `max_completion_tokens`, `temperature`, `top_p`, and `top_k`. If you send them, Codex may throw an error.
- **Reasoning Effort:** The `reasoning_effort` parameter (used in o1/o3 models) must be reformatted for Codex. CLIProxyAPI maps `reasoning_effort` to a nested object `reasoning.effort` (e.g. `"low"`, `"medium"`, `"high"`, `"xhigh"`). If the user does not provide one, it defaults to `"medium"`.
- **Reasoning Fields:** It also injects `reasoning.summary = "auto"` and `include = ["reasoning.encrypted_content"]`.
- **Parallel Tools:** Injects `parallel_tool_calls = true`.

### Streaming Response Handling
If utilizing the streaming endpoint `/responses`, the response is parsed utilizing SSE (Server Sent Events). 
Each chunk begins with `data: `. You can parse the chunks for tracking generation. Specifically, look out for the chunk containing `{"type": "response.completed"}` which signals the end of the streaming payload and contains usage/token metrics.
