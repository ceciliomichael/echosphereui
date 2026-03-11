# Google Gemini SDK Guide (TypeScript, `@google/genai`)

Last verified: March 11, 2026

This guide is for normal Google Gemini provider usage with the official TypeScript SDK.

## 1. Install and Client Setup

```bash
npm install @google/genai
```

```typescript
import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
```

Server-side only:

- keep API keys in backend env/secret manager
- do not expose Gemini API keys in browser bundles

## 2. Minimal Generate Content Call

```typescript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "Give me 3 API design principles.",
});

console.log(response.text);
```

## 3. Request Format Essentials

Gemini uses `contents` with `parts` and optional `config`.

Simple multi-turn-like shape:

```typescript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    {
      role: "user",
      parts: [{ text: "What is CQRS?" }],
    },
    {
      role: "model",
      parts: [{ text: "CQRS separates command and query operations." }],
    },
    {
      role: "user",
      parts: [{ text: "Explain when to avoid it." }],
    },
  ],
});
```

## 4. Conversation State Patterns

Choose one primary state strategy.

## 4.1 App-managed history (explicit)

- persist conversation in your DB/session store
- resend relevant history in `contents`
- summarize/prune as context grows

## 4.2 SDK chat helper (`ai.chats`)

Use local stateful helper for simpler multi-turn orchestration:

```typescript
const chat = ai.chats.create({
  model: "gemini-2.5-flash",
});

const turn1 = await chat.sendMessage({ message: "Design 3 REST naming rules." });
console.log(turn1.text);

const turn2 = await chat.sendMessage({ message: "Now give bad examples." });
console.log(turn2.text);
```

## 4.3 Interactions API (advanced)

Google also documents interaction-level state with `previous_interaction_id` and retrieval APIs.

Use this only when you specifically need interaction object lifecycle/state retrieval semantics.

## 5. Function Calling (Manual TS Loop)

## 5.1 Declare tools

```typescript
const tools = [
  {
    functionDeclarations: [
      {
        name: "get_weather",
        description: "Get weather by city",
        parameters: {
          type: "OBJECT",
          properties: {
            city: { type: "STRING" },
          },
          required: ["city"],
        },
      },
    ],
  },
] as const;
```

## 5.2 Send request and inspect function calls

```typescript
const first = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [{ role: "user", parts: [{ text: "What's the weather in Manila?" }] }],
  config: {
    tools,
    toolConfig: {
      functionCallingConfig: {
        mode: "AUTO", // also supports ANY / NONE
      },
    },
  },
});

const callParts = first.candidates?.[0]?.content?.parts?.filter(
  (p) => "functionCall" in p && p.functionCall,
);
```

## 5.3 Execute tool and send function response

```typescript
function runGetWeather(city: string) {
  return { city, temp_c: 31, condition: "partly cloudy" };
}

const functionResponses = (callParts ?? []).map((part) => {
  const name = part.functionCall!.name;
  const args = (part.functionCall!.args ?? {}) as { city?: string };

  if (name !== "get_weather") {
    return {
      functionResponse: {
        name,
        response: { error: `Unsupported tool: ${name}` },
      },
    };
  }

  return {
    functionResponse: {
      name,
      response: runGetWeather(args.city ?? "unknown"),
    },
  };
});

const second = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    { role: "user", parts: [{ text: "What's the weather in Manila?" }] },
    first.candidates?.[0]?.content ?? { role: "model", parts: [] },
    { role: "user", parts: functionResponses },
  ],
  config: { tools },
});

console.log(second.text);
```

Implementation notes:

- In JS/TS, tool orchestration is typically manual.
- Keep tool execution sandboxed and validate args before use.

## 6. Streaming Pattern

```typescript
const stream = await ai.models.generateContentStream({
  model: "gemini-2.5-flash",
  contents: "Explain event-driven architecture in 4 bullets.",
});

for await (const chunk of stream) {
  // incremental text may appear in chunk.text
  process.stdout.write(chunk.text ?? "");
}
process.stdout.write("\n");
```

Best practice:

- separate partial rendering from final post-processing
- guard against missing fields on intermediate chunks

## 7. Thinking and Thought Signatures

For thinking-capable models:

- use documented thinking controls in config where needed
- preserve thought signatures when manually managing eligible flows
- avoid editing/re-ordering signed thought data

If thought signatures are required but lost/altered, requests can fail.

### 7.1 Thinking Effort Controls (Google Equivalent)

Google uses thinking configuration fields (not OpenAI `reasoning.effort`).

```typescript
const quick = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "Answer briefly: what is eventual consistency?",
  config: {
    thinkingConfig: {
      thinkingBudget: 256,
    },
  },
});

const deep = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "Design a resilient multi-region architecture with failure tradeoffs.",
  config: {
    thinkingConfig: {
      thinkingBudget: 2048,
    },
  },
});
```

Model-specific note:

- supported thinking fields vary by model family/version (for example budget-based controls and level-based controls)
- verify exact allowed values on the model's current docs before hardcoding

## 8. Token Counting and Context Budgeting

```typescript
const tokenInfo = await ai.models.countTokens({
  model: "gemini-2.5-flash",
  contents: "Summarize bounded contexts in DDD.",
});

console.log(tokenInfo.totalTokens);
```

Use this to:

- estimate request cost
- cap history growth
- trigger summarization before context overflow

## 9. Caching

Gemini supports implicit and explicit caching.

Use explicit caching when repeated large shared prefixes are common across requests, and manage TTL/invalidations in app policy.

## 10. Safety and Error Handling

- Configure safety settings per request as needed.
- Inspect feedback/finish metadata when outputs are blocked.
- Catch SDK `ApiError` and branch handling by status/retryability.

Pattern:

```typescript
import { ApiError } from "@google/genai";

try {
  await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "...",
  });
} catch (err) {
  if (err instanceof ApiError) {
    console.error("Gemini API error", { status: err.status, message: err.message });
  } else {
    console.error("Unexpected error", err);
  }
}
```

## 11. OpenAI/Anthropic -> Google Mapping

- OpenAI `responses.create` -> Google `models.generateContent`
- Anthropic `messages.create` -> Google `models.generateContent`
- OpenAI `function_call_output` / Anthropic `tool_result` -> Google `functionResponse` parts
- OpenAI/Anthropic state primitives -> Google `contents` history, `ai.chats`, or Interactions API

Do not reuse provider payloads without explicit transformation.

## 12. Production Checklist

- Auth:
  - `GEMINI_API_KEY` from env/secret manager
  - key never exposed to browser client
- State:
  - one state strategy chosen per conversation pipeline
  - compaction/summarization policy defined
- Tools:
  - function declaration schemas validated
  - args validated before execution
  - robust unknown-tool handling
- Streaming:
  - incremental rendering tested
  - finalization logic tested under partial chunks
- Cost:
  - `countTokens` integrated for budget checks
  - caching strategy documented
- Reliability:
  - retries/timeouts and error taxonomy in place

## 13. References

- Quickstart: https://ai.google.dev/gemini-api/docs/quickstart
- API reference: https://ai.google.dev/api
- Generate content: https://ai.google.dev/api/generate-content
- Function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Tools: https://ai.google.dev/gemini-api/docs/tools
- Interactions: https://ai.google.dev/gemini-api/docs/interactions
- Thinking: https://ai.google.dev/gemini-api/docs/thinking
- Thought signatures: https://ai.google.dev/gemini-api/docs/thought-signatures
- Tokens: https://ai.google.dev/api/tokens
- Caching: https://ai.google.dev/gemini-api/docs/caching/
- Safety settings: https://ai.google.dev/docs/safety_setting_gemini
- JS SDK docs: https://googleapis.github.io/js-genai/release_docs/index.html
- JS SDK repo: https://github.com/googleapis/js-genai
