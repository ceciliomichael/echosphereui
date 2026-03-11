# OpenAI Responses API Guide (OpenAI Provider, TypeScript-First)

Last verified: March 11, 2026

This guide is for the normal public OpenAI provider flow using the official OpenAI SDK in TypeScript.

Use this when calling:

- `https://api.openai.com/v1/responses`

Do not use this guide for internal backend-specific flows (`chatgpt.com/backend-api/codex/...`).

## 1. Auth and Setup

Public OpenAI provider auth uses API keys.

- Set `OPENAI_API_KEY` in your environment.
- Use official OpenAI SDK (`openai` package).
- Do not send internal backend-specific headers (`Version`, `Originator`, `Chatgpt-Account-Id`, etc.).

Install:

```bash
npm install openai
```

Create client:

```typescript
import OpenAI from "openai";

export const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

## 2. Minimal Request

```typescript
const response = await client.responses.create({
  model: "gpt-4.1-mini",
  input: "Write one sentence about clean architecture.",
});

console.log(response.output_text);
```

## 3. State and History Models

Choose one state model per request:

1. Manual stateless history: resend prior items in `input`.
2. Response chaining: pass `previous_response_id`.
3. Durable server-managed state: pass `conversation` (`conv_...`).

Important rules:

- `previous_response_id` cannot be used with `conversation` in the same request.
- If you use `instructions` with `previous_response_id`, prior `instructions` are not automatically carried over.
- Prior context still counts toward billed input tokens.

### 3.1 Stateless history example

```typescript
const response = await client.responses.create({
  model: "gpt-4.1-mini",
  input: [
    { role: "user", content: "Knock knock." },
    { role: "assistant", content: "Who's there?" },
    { role: "user", content: "Orange." },
  ],
});
```

### 3.2 Chained turn example (`previous_response_id`)

```typescript
const first = await client.responses.create({
  model: "gpt-4.1-mini",
  input: "Tell me a short joke.",
});

const second = await client.responses.create({
  model: "gpt-4.1-mini",
  previous_response_id: first.id,
  input: "Explain why that joke works.",
});
```

### 3.3 Durable conversation example (`conversation`)

```typescript
const conversation = await client.conversations.create();

const response = await client.responses.create({
  model: "gpt-4.1-mini",
  conversation: conversation.id,
  input: "Give me 3 naming rules for REST endpoints.",
});
```

## 4. Tools and Function Calling

Function calling loop:

1. Send `tools` in request.
2. Model returns one or more `function_call` output items.
3. Execute tool(s) in your app.
4. Send follow-up request with `function_call_output` items.
5. Continue until final answer.

### 4.1 Tool declaration (TypeScript)

```typescript
const tools = [
  {
    type: "function",
    name: "get_weather",
    description: "Get weather for a city",
    parameters: {
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

### 4.2 Tool call + tool output loop (TypeScript)

```typescript
type WeatherArgs = { city: string };

const first = await client.responses.create({
  model: "gpt-4.1-mini",
  input: "What's the weather in Manila?",
  tools,
});

const toolOutputs: Array<{
  type: "function_call_output";
  call_id: string;
  output: string;
}> = [];

for (const item of first.output ?? []) {
  if (item.type !== "function_call") continue;
  if (item.name !== "get_weather") continue;

  const args = JSON.parse(item.arguments || "{}") as WeatherArgs;
  const result = {
    city: args.city,
    temp_c: 31,
    condition: "partly cloudy",
  };

  toolOutputs.push({
    type: "function_call_output",
    call_id: item.call_id,
    output: JSON.stringify(result),
  });
}

if (toolOutputs.length > 0) {
  const followUp = await client.responses.create({
    model: "gpt-4.1-mini",
    previous_response_id: first.id,
    input: toolOutputs,
  });

  console.log(followUp.output_text);
}
```

## 5. Streaming (TypeScript)

```typescript
const stream = await client.responses.stream({
  model: "gpt-4.1-mini",
  input: "Explain event-driven architecture in 4 bullets.",
});

for await (const event of stream) {
  switch (event.type) {
    case "response.output_text.delta":
      process.stdout.write(event.delta || "");
      break;
    case "response.reasoning_summary_text.delta":
      // Optional separate rendering channel for reasoning summary
      break;
    case "response.completed":
      process.stdout.write("\n");
      break;
  }
}
```

Common event types:

- `response.output_text.delta`
- `response.reasoning_summary_text.delta`
- `response.output_item.added`
- `response.function_call_arguments.delta`
- `response.completed`

## 6. Reasoning and Additional Fields

Common request fields:

- `reasoning`
- `include`
- `store`
- `truncation`
- `tools` / `tool_choice`
- `parallel_tool_calls`

Example:

```typescript
const response = await client.responses.create({
  model: "gpt-4.1-mini",
  input: "Compare monolith vs modular architecture in 5 bullets.",
  reasoning: { effort: "medium", summary: "auto" },
  include: ["reasoning.encrypted_content"],
});
```

## 7. `thread_id` and Legacy APIs

For modern Responses integrations, do not design around `thread_id`.

- `thread_id` belongs to the Assistants/Threads surface.
- Responses-native state is `previous_response_id` and `conversation`.
- Migration guidance classifies Assistants as legacy/deprecated relative to Responses, with listed sunset date August 26, 2026.

## 8. Production Checklist

- Auth:
  - `OPENAI_API_KEY` loaded from env/secret manager.
  - no hardcoded keys.
- State:
  - use exactly one of manual history / `previous_response_id` / `conversation` per request.
  - never mix `previous_response_id` and `conversation`.
  - re-send `instructions` explicitly when needed.
- Tools:
  - validate parsed arguments before execution.
  - return outputs as `function_call_output` with matching `call_id`.
  - support multiple function calls per turn.
- Streaming:
  - route by event `type`.
  - handle partial/invalid chunks safely.
- Safety:
  - set request timeouts and bounded retries.
  - redact secrets in logs.

## 9. Common Mistakes

### Mistake: using internal backend-specific headers for OpenAI provider

Fix: use SDK API-key auth only for public OpenAI provider calls.

### Mistake: returning tool output as a plain user message

Fix: return typed `function_call_output` items.

### Mistake: mixing `previous_response_id` and `conversation`

Fix: choose one state strategy for each request.

### Mistake: assuming `previous_response_id` removes token cost

Fix: it simplifies state linking, but prior context still contributes to billed input tokens.

## 10. References (Official)

- Responses create reference: https://platform.openai.com/docs/api-reference/responses/create
- Conversation state guide: https://platform.openai.com/docs/guides/conversation-state
- Function calling guide: https://platform.openai.com/docs/guides/function-calling
- Migrate to Responses guide: https://platform.openai.com/docs/guides/migrate-to-responses
