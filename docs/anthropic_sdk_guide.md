# Anthropic SDK Guide (TypeScript, Messages API)

Last verified: March 11, 2026

This guide is for Anthropic provider usage via the official TypeScript SDK.

## 1. Install and Client Setup

```bash
npm install @anthropic-ai/sdk
```

```typescript
import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // Optional production controls:
  maxRetries: 2,
  timeout: 30_000,
});
```

## 2. Minimal Chat Call

```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 512,
  messages: [
    {
      role: "user",
      content: "Give me 3 API design rules.",
    },
  ],
});

const text = response.content
  .filter((block) => block.type === "text")
  .map((block) => block.text)
  .join("\n");

console.log(text);
```

## 3. Anthropic Message Model (Core Differences)

- The API is stateless in normal usage; your app sends relevant history in `messages` each turn.
- Content is block-based (`text`, `tool_use`, `tool_result`, etc.).
- Tool usage is driven by content blocks and `stop_reason`, not OpenAI-style response item chaining.
- System prompt guidance is set through top-level request fields (for example `system`) rather than relying on a normal `system` chat message format.

## 4. Stateful Conversation Pattern (App-Managed)

```typescript
import Anthropic from "@anthropic-ai/sdk";

type MessageParam = Anthropic.MessageParam;

const history: MessageParam[] = [];

export async function askAnthropic(userText: string) {
  history.push({ role: "user", content: userText });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    system: "You are a concise senior engineer.",
    messages: history,
  });

  history.push({ role: "assistant", content: response.content });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return text;
}
```

Implementation note:

- Persist `history` per session/user in storage.
- Summarize/prune long histories to manage token costs and context windows.

## 5. Tools: Required Contract and Correct Loop

Anthropic tool definitions use `input_schema`.

```typescript
const tools = [
  {
    name: "get_weather",
    description: "Get weather by city",
    input_schema: {
      type: "object",
      properties: {
        city: { type: "string" },
      },
      required: ["city"],
      additionalProperties: false,
    },
  },
] as const;
```

### 5.1 Tool loop implementation

```typescript
type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: { city?: string };
};

function runGetWeather(input: { city?: string }) {
  return {
    city: input.city ?? "unknown",
    temp_c: 31,
    condition: "partly cloudy",
  };
}

const first = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 512,
  messages: [{ role: "user", content: "What's the weather in Manila?" }],
  tools,
});

if (first.stop_reason === "tool_use") {
  const toolUses = first.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

  // Build tool_result blocks in the immediate next user message.
  const toolResults = toolUses.map((tu) => {
    const output = runGetWeather(tu.input);
    return {
      type: "tool_result" as const,
      tool_use_id: tu.id,
      content: JSON.stringify(output),
    };
  });

  const second = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    messages: [
      { role: "user", content: "What's the weather in Manila?" },
      { role: "assistant", content: first.content },

      // Anthropic requires this to be the immediate next user turn.
      // tool_result blocks must come first in this content array.
      {
        role: "user",
        content: [
          ...toolResults,
          { type: "text", text: "Now summarize it in one sentence." },
        ],
      },
    ],
    tools,
  });

  const finalText = second.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  console.log(finalText);
}
```

Critical Anthropic rules:

- after assistant `tool_use`, the very next user message must carry `tool_result`
- do not insert other messages between tool request and tool result
- in the tool result message, `tool_result` blocks must be first

## 6. Streaming Pattern (SSE/Event)

```typescript
const stream = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 512,
  messages: [{ role: "user", content: "Explain CQRS in 4 bullets." }],
  stream: true,
});

for await (const event of stream) {
  switch (event.type) {
    case "content_block_delta":
      // handle incremental text/tool deltas
      break;
    case "message_delta":
      // handle stop_reason/usage deltas
      break;
    case "message_stop":
      // finalize turn
      break;
  }
}
```

Common event types:

- `message_start`
- `content_block_start`
- `content_block_delta`
- `message_delta`
- `message_stop`

## 7. Error Handling and Reliability

Recommended defaults:

- set SDK `maxRetries` and `timeout`
- implement idempotent retry policy around network/transient errors
- classify SDK/API errors into retryable vs non-retryable buckets
- redact API keys and tool secrets from logs

## 8. OpenAI Responses -> Anthropic Mapping

When migrating from OpenAI Responses:

- OpenAI `responses.create(...)` -> Anthropic `messages.create(...)`
- OpenAI `function_call_output` items -> Anthropic `tool_result` content blocks
- OpenAI response-id chaining/conversation objects -> Anthropic app-managed `messages` history loop
- OpenAI event names -> Anthropic message/content block event names

Do not copy tool output formatting across providers without remapping.

## 9. Advanced Features to Add After Core Loop Is Stable

- Extended thinking controls
- Prompt caching
- Model Context Protocol (MCP) server integrations

Add these only after your base message/tool/stream loop is correct and tested.

## 10. Production Checklist

- Auth:
  - `ANTHROPIC_API_KEY` loaded via env/secret manager
  - no hardcoded keys
- State:
  - session transcript persisted in app storage
  - long-context summarization policy defined
- Tools:
  - `input_schema` validation enforced
  - strict `tool_use -> immediate tool_result` sequence implemented
  - multi-tool calls in a single turn supported
- Streaming:
  - event router by `event.type`
  - partial delta assembly tested
- Safety:
  - retries/timeouts configured
  - secrets redacted in logs and errors

## 11. References

- Messages examples: https://docs.anthropic.com/en/api/messages-examples
- Messages API reference: https://docs.anthropic.com/en/api/messages
- Tool use overview: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview
- Streaming: https://docs.anthropic.com/en/docs/build-with-claude/streaming
- Errors: https://docs.anthropic.com/en/api/errors
- SDK (TypeScript): https://github.com/anthropics/anthropic-sdk-typescript
- Prompt caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Extended thinking: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
