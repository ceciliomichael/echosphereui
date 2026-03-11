# Google Gemini SDK Usage Research (TypeScript Focus, Source-Backed)

Last verified: March 11, 2026

## Scope

This research summarizes official Google Gemini SDK/API behavior relevant to production app integration with TypeScript.

Covered:

- authentication and SDK initialization
- request/response format differences vs OpenAI/Anthropic
- state/history options
- function calling contract
- streaming behavior
- thinking/thought signatures
- token counting and caching
- safety/error considerations

## Primary Sources Reviewed

- Gemini API quickstart: https://ai.google.dev/gemini-api/docs/quickstart
- Gemini API reference overview: https://ai.google.dev/api
- Generate content reference: https://ai.google.dev/api/generate-content
- Function calling guide: https://ai.google.dev/gemini-api/docs/function-calling
- Tools overview: https://ai.google.dev/gemini-api/docs/tools
- Interactions API guide: https://ai.google.dev/gemini-api/docs/interactions
- Thinking guide: https://ai.google.dev/gemini-api/docs/thinking
- Thought signatures guide: https://ai.google.dev/gemini-api/docs/thought-signatures
- Token counting reference: https://ai.google.dev/api/tokens
- Context caching guide: https://ai.google.dev/gemini-api/docs/caching/
- Safety settings guide: https://ai.google.dev/docs/safety_setting_gemini
- JS SDK docs (`@google/genai`): https://googleapis.github.io/js-genai/release_docs/index.html
- JS SDK repository: https://github.com/googleapis/js-genai

## Confirmed Findings

## 1. Auth and SDK setup

For Gemini Developer API:

- API key is required.
- Raw HTTP uses `x-goog-api-key`.
- TypeScript SDK package is `@google/genai`.

Quickstart shows `GEMINI_API_KEY` environment usage; SDK docs also show explicit `apiKey` initialization and optional env-based setup.

Practical integration choice:

- Prefer explicit `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })` in server code for clarity.

## 2. Core generation surface

Primary API surface is `generateContent` and `streamGenerateContent` at the API level.

In JS SDK, this maps to:

- `ai.models.generateContent(...)`
- `ai.models.generateContentStream(...)`

This is not OpenAI `responses.create(...)`, and not Anthropic `messages.create(...)`.

## 3. Request format model

Gemini requests are `contents`-based with `parts` blocks, plus optional `config`.

Important differences:

- OpenAI-style `messages` array contract does not apply directly.
- Anthropic-style `role/content blocks` also differs in field naming and tool envelope.

## 4. State/history patterns

Confirmed supported patterns:

1. Manual history management: send conversation context in `contents`/history each turn.
2. SDK local chat helper: `ai.chats` creates local stateful chat objects for easier multi-turn usage.
3. Interactions API: supports `previous_interaction_id` and retrieval APIs as an alternate state model.

Implication:

- state model selection must be explicit per integration.
- avoid mixing patterns accidentally in the same conversation pipeline.

## 5. Function calling contract

Gemini function calling requires tool declarations with schema and a roundtrip:

1. Provide function declarations in `tools`.
2. Model may return function call payload.
3. Application executes function.
4. Application sends function response back with conversation history.

Documented controls include function calling modes via `toolConfig.functionCallingConfig`:

- `AUTO`
- `ANY`
- `NONE`

Important nuance from official docs:

- Python SDK has automatic function calling support.
- JavaScript/TypeScript flow is manual orchestration (execute + send response back).

## 6. Streaming behavior

Streaming endpoint exists and SDK supports async chunk iteration.

`generateContentStream` yields incremental chunks; application should assemble/render partial output progressively and finalize on stream completion.

## 7. Thinking and thought signatures

Thinking docs confirm:

- Gemini API is stateless.
- Thought signatures preserve reasoning context across turns for thinking models.
- SDK handles thought-signature mechanics automatically in standard SDK flows.
- Thinking depth/effort is controlled with model-specific thinking config (for example budget-based and level-based controls).

Critical detail for manual request construction:

- dropping required thought signatures in applicable function-calling flows can cause request failures (documented 400 behavior).

## 8. Token counting and usage accounting

`models.countTokens` is available (API + SDK).

Use cases:

- estimate prompt cost before generation
- monitor conversation growth
- calculate combined history + next turn budget

`usageMetadata` fields in generation responses provide token usage details.

## 9. Context caching

Gemini provides:

- implicit caching (model-dependent, automatic)
- explicit caching via cache API objects and TTL

Practical implications:

- explicit caching can reduce repeated large-prefix costs
- cache lifecycle and TTL should be managed as part of infra policy

## 10. Safety configuration

Safety settings are configurable per request via safety settings config.

Blocked outputs can be diagnosed through response feedback fields (`promptFeedback`, candidate finish/safety details as documented).

## 11. Reliability and SDK concerns

SDK docs provide dedicated error handling class (`ApiError`) and production cautions (e.g., avoid exposing API keys in browser client code).

Operational implications:

- classify errors into retryable/non-retryable classes
- keep keys server-side
- log structured metadata without secrets

## Key Differences vs Other Providers

## Google vs OpenAI

- Google: `generateContent` + `contents/parts`
- OpenAI: `responses.create` + `input/output items`
- Tool response wiring and state primitives differ

## Google vs Anthropic

- Google: function call + function response parts with Gemini schema
- Anthropic: `tool_use` then strict immediate `tool_result` sequencing rules

Provider-agnostic abstractions should normalize these differences explicitly.

## Guide Design Decisions Derived from Research

The implementation guide should be:

1. TypeScript-first (`@google/genai`).
2. Start with minimal `generateContent` flow.
3. Add two state options (manual history and `ai.chats`).
4. Include function-calling manual loop in TS.
5. Include streaming chunk loop.
6. Include optional advanced sections (thinking, tokens, caching, safety).
7. Include migration notes for OpenAI/Anthropic users.

## Risks to Highlight in Implementation Guide

- using stale SDK package (`@google/generative-ai`) instead of `@google/genai`
- treating provider contracts as interchangeable
- missing function-response roundtrip details
- unmanaged conversation growth without token counting/compaction
- client-side API key exposure

## Research Confidence

High confidence for core SDK/API behavior, based on current official docs and SDK references.
