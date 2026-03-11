# Anthropic SDK Usage Research (Source-Backed)

Last verified: March 11, 2026

## Scope

This research covers Anthropic's official SDK/API usage patterns for building a production chat/tool integration.

Focus areas:

- authentication and request contract
- state/history model
- message and content format
- tool use and tool_result sequencing
- streaming event model
- error/retry behavior in SDK
- practical implications for guide design

## Sources Reviewed

- Messages API examples: https://docs.anthropic.com/en/api/messages-examples
- Tool use overview: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview
- Streaming messages: https://docs.anthropic.com/en/docs/build-with-claude/streaming
- SDK README (TypeScript): https://github.com/anthropics/anthropic-sdk-typescript
- Messages API reference: https://docs.anthropic.com/en/api/messages
- Errors: https://docs.anthropic.com/en/api/errors
- Prompt caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Extended thinking: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking

## Confirmed Findings

## 1. Auth and base contract

Anthropic API requests use API-key auth and versioning headers in raw HTTP:

- `x-api-key`
- `anthropic-version`
- `content-type: application/json`

In SDK usage, these are handled for you when you initialize the client with API key.

Practical implication:

- no OpenAI-style `Authorization: Bearer` format in direct raw Anthropic calls
- SDK is preferred to avoid header/version drift

## 2. State/history model is stateless by default

Anthropic Messages API is stateless in normal usage: you send conversation history in `messages` each turn.

Practical implication:

- app must own transcript storage
- no `thread_id`-style primary state primitive in this flow
- context compaction/summarization strategy is required for long sessions

## 3. Message format differs from OpenAI Responses

Anthropic uses `messages` with `role` (`user`/`assistant`) and `content` blocks.

Tool calls and other outputs are represented as typed content blocks inside message content, rather than OpenAI Responses item chain semantics.

System behavior is configured via top-level request fields (for example `system`) rather than adding a normal `system` role message in the same way OpenAI chat formats often do.

## 4. Tool contract is materially different

Tool definitions use:

- `name`
- `description`
- `input_schema`

When model chooses tool use:

- assistant response contains `tool_use` content block(s)
- response stop reason is typically `tool_use`

Then your app must execute tool(s) and send results back via user message content blocks of type `tool_result`.

Critical sequencing constraints documented by Anthropic:

- `tool_result` blocks must be in the next user message after tool use
- no intervening messages allowed between `tool_use` and `tool_result`
- in the user message content, `tool_result` blocks must come first before text blocks

This is stricter than many OpenAI-style function-calling implementations.

## 5. Streaming model is event-based

Anthropic streaming is SSE/event-oriented with events such as:

- `message_start`
- `content_block_start`
- `content_block_delta`
- `message_delta`
- `message_stop`
- keepalive/ping-style events

Practical implication:

- robust parser should route by event type
- tool arguments may arrive incrementally and must be assembled safely
- finalization logic should wait for stop event, not first text completion

## 6. SDK supports retries/timeouts

TypeScript SDK docs show configurable retries/timeouts and built-in error classes.

Practical implication:

- use bounded retries + request timeout in production defaults
- map known API/network errors into stable app-level error responses

## 7. Extended thinking and prompt caching are first-class docs topics

Anthropic documentation provides separate guidance for:

- extended thinking
- prompt caching

Practical implication:

- keep these as optional advanced sections in the implementation guide
- avoid mixing into minimal path until core message/tool loop is correct

## 8. Compatibility caveat when porting from OpenAI Responses

Direct OpenAI Responses patterns cannot be copied 1:1:

- tool output shape is different (`tool_result` blocks vs `function_call_output` items)
- state wiring is different (messages history loop vs response-id chain/conversation primitives)
- streaming events and assembly logic differ

## Guide Design Decisions Derived From Research

The implementation guide should:

1. be TypeScript-first
2. start with minimal non-tool chat
3. then add tool use with strict sequencing examples
4. include explicit parser notes for streamed events
5. add an "OpenAI -> Anthropic mapping" section to reduce migration mistakes
6. keep advanced thinking/caching sections optional and clearly scoped

## Risks to Call Out in Guide

- incorrectly ordered `tool_result` blocks can break the turn
- missing transcript state management can cause context loss
- assuming OpenAI function-calling semantics leads to malformed requests
- weak event handling can produce partial or corrupted streamed outputs

## Research Confidence

High confidence on core contract areas (messages statelessness, tool_result sequencing, streaming event model, SDK-based auth usage), because these appear in official examples/guides and SDK docs.
