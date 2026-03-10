# OpenAI Responses API State and History Research

Last verified: March 10, 2026

This document summarizes how the official public OpenAI Responses API currently handles state, history, tools, and `thread_id`.

## Executive Summary

For the public Responses API, history is not primarily managed with `thread_id`.

Use one of these mechanisms:

1. Manual history in `input` (fully app-managed stateless flow).
2. Chaining with `previous_response_id`.
3. Durable server-managed state with a `conversation` (`conv_...`).

`thread_id` belongs to the legacy Assistants API surface, not the main Responses state model.

## State and History in Public Responses

### 1. Manual stateless history

Send prior turns again in `input` on each request.

Use this when you want full transcript control, strict statelessness, or custom compaction/redaction.

### 2. Chaining with `previous_response_id`

Pass the prior response ID to continue a conversation without resending full visible message history.

Important rules from the current reference:

- `previous_response_id` cannot be used together with `conversation`.
- If you send `instructions` with `previous_response_id`, prior `instructions` are not automatically carried over.
- Prior turns in the chain still count toward billed input tokens.

### 3. Durable state with `conversation`

Use a conversation object for server-managed persistent history (`conv_...`).

Current behavior in the Responses reference:

- Conversation items are prepended into request context.
- Input and output items from the response are appended to that conversation.

This is the modern thread-like state primitive for public Responses.

## Tools in Public Responses

Public Responses function calling uses typed output/input items.

High-level loop:

1. Send request with `tools`.
2. Receive one or more `function_call` output items.
3. Execute tool(s) in your app.
4. Send follow-up request containing `function_call_output` item(s) with matching `call_id`.
5. Continue until model returns final answer (or more calls).

Key point: tool results should be returned as typed `function_call_output` items, not as fake user text.

## Storage, Truncation, and Long Context

Current Responses controls to model correctly:

- `store`: responses are stateful by default unless disabled for stateless/compliance workflows.
- `truncation`: use `disabled` (strict) or `auto` (service may drop oldest context when needed).
- `include`: supports additional fields such as `reasoning.encrypted_content` where applicable.

Do not assume infinite context just because state is server-managed; compaction/summarization is still required for long conversations.

## Where `thread_id` Fits Now

`thread_id` is part of the Assistants/Threads surface, not the normal public Responses state model.

As of March 10, 2026:

- OpenAI migration docs classify Assistants as deprecated/legacy relative to Responses.
- OpenAI lists an Assistants API sunset date of August 26, 2026.

For new builds, use Responses-native state (`previous_response_id` or `conversation`) instead of `thread_id`.

## Practical Rules

If you are implementing a new public Responses integration:

1. Pick one state strategy per request: manual history, `previous_response_id`, or `conversation`.
2. Do not mix `previous_response_id` and `conversation`.
3. Re-send `instructions` explicitly when needed in chained flows.
4. Return tool outputs as `function_call_output` items with `call_id`.
5. Treat `thread_id` as legacy/Assistants-era, not the default modern pattern.

## Important Difference for This Repository

This repository also uses an internal Codex backend (`https://chatgpt.com/backend-api/codex/...`) behind a compatibility proxy.

That backend contract is different from public Responses:

- authentication is Codex OAuth-based (not public API-key auth for direct backend calls)
- payload/headers are stricter and Codex-specific
- state/tool handling may differ from official public Responses items

See:

- [docs/direct_responses_api_guide.md](direct_responses_api_guide.md)
- [docs/codex_proxy_explanation.md](codex_proxy_explanation.md)

## Sources

- OpenAI Responses create reference: https://platform.openai.com/docs/api-reference/responses/create
- OpenAI Conversation state guide: https://platform.openai.com/docs/guides/conversation-state
- OpenAI Function calling guide: https://platform.openai.com/docs/guides/function-calling
- OpenAI Migrate to Responses guide: https://platform.openai.com/docs/guides/migrate-to-responses
