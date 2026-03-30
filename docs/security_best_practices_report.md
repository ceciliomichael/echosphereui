# Tool Loop Prompt Injection Audit

## Executive Summary

I reviewed the tool-loop and prompt-building paths for EchoSphere and found no sign of a hidden or covert "message injection" backdoor. What does exist is a deliberate set of serialization paths that feed user content, tool output, runtime context, workspace metadata, and provider-specific tool replay data back into the model on every loop turn.

That behavior is expected for an agentic coding app, but it is also the main prompt-injection surface. The highest-risk path is the Codex/OpenAI-compatible tool replay path, where tool outputs are re-emitted as user-visible content with authoritative framing.

## Findings

### F-1 High: Tool outputs are intentionally injected back into the model context as authoritative replay data

The loop replays history, appends synthetic runtime context, streams a turn, executes tools, appends tool results, and repeats. Tool results are not kept out of model context; they are explicitly serialized back into the next prompt.

Relevant code:
- [electron/chat/agentLoop/runtime.ts](./electron/chat/agentLoop/runtime.ts) lines 95, 125, 130, 169, 180
- [electron/chat/openaiCompatible/toolExecution.ts](./electron/chat/openaiCompatible/toolExecution.ts) lines 48, 57, 71, 185, 198
- [electron/chat/openaiCompatible/toolResultFormatter.ts](./electron/chat/openaiCompatible/toolResultFormatter.ts) lines 20, 55
- [electron/chat/openaiCompatible/toolResultReplayEnvelope.ts](./electron/chat/openaiCompatible/toolResultReplayEnvelope.ts) lines 3, 7, 14, 23, 44, 54
- [electron/chat/providers/codexPayload.ts](./electron/chat/providers/codexPayload.ts) lines 96, 101, 109, 123, 163
- [electron/chat/openaiCompatible/runtime.ts](./electron/chat/openaiCompatible/runtime.ts) lines 107, 127, 209, 261

What is injected:
- Tool results from `list`, `read`, `glob`, `grep`, `write`, `edit`, `apply_patch`, `run_terminal`, `get_terminal_output`, `ask_question`, and `ready_implement`.
- Synthetic tool failure text when a tool errors.
- Raw tool bodies such as file contents and terminal output.
- Authoritative wrapper text like `[SYSTEM TOOL OUTPUT]` and `<tool_results>`.

Impact:
- Any untrusted workspace content, terminal output, or tool-produced text can steer the next model turn.
- In the Codex path, tool outputs are converted to a user-role message, which makes the injection surface especially strong.
- This is not necessarily a bug, but it is the core prompt-injection exposure for the product.

### F-2 Medium: Free-form user decision text is echoed into future model-visible tool results

Two interactive tools collect user decisions during the tool loop. Their answers are stored in semantic results and then rendered into tool-result bodies and metadata that are replayed to the model.

Relevant code:
- [electron/chat/openaiCompatible/tools/ask-question/index.ts](./electron/chat/openaiCompatible/tools/ask-question/index.ts) lines 94, 100, 108, 109, 115
- [electron/chat/openaiCompatible/tools/ready-implement/index.ts](./electron/chat/openaiCompatible/tools/ready-implement/index.ts) lines 61, 66, 77, 86
- [electron/chat/openaiCompatible/toolResultBodies.ts](./electron/chat/openaiCompatible/toolResultBodies.ts) lines 194, 195, 199, 201, 217, 218, 221, 224
- [electron/chat/openaiCompatible/toolResultMetadata.ts](./electron/chat/openaiCompatible/toolResultMetadata.ts) lines 256, 257, 259, 263, 270, 271, 542, 546, 554, 555, 558

What is injected:
- `answerText` from custom user responses.
- `selectedOptionLabel` from chosen options.
- Tool-result body text such as `Answer: ...`, `Custom answer: ...`, or `Selected option: ...`.

Impact:
- A user can feed arbitrary text into later model context through a tool decision.
- This is expected for `ask_question`, but it should be treated as untrusted prompt material, not as safe metadata.

### F-3 Medium: Workspace and shell metadata are inserted into the system prompt

The system prompt is not static. It includes a generated workspace tree and shell/runtime context, both of which are derived from the local machine and workspace contents.

Relevant code:
- [electron/chat/prompts/index.ts](./electron/chat/prompts/index.ts) lines 15, 17, 24, 28
- [electron/chat/prompts/agent/prompt.ts](./electron/chat/prompts/agent/prompt.ts) lines 4, 16, 27, 38, 44, 45, 46, 47
- [electron/chat/prompts/plan/prompt.ts](./electron/chat/prompts/plan/prompt.ts) lines 3, 12, 56, 67, 73, 74, 76
- [electron/chat/prompts/shared/workspaceFileTree.ts](./electron/chat/prompts/shared/workspaceFileTree.ts) lines 10, 11, 15, 34, 63, 89, 96, 119, 153, 161, 163
- [electron/chat/prompts/shared/runtimeContext.ts](./electron/chat/prompts/shared/runtimeContext.ts) lines 3, 19, 27, 29, 30

What is injected:
- Workspace root path.
- gitignore-filtered folder tree.
- Host platform and shell label.

Impact:
- This is a normal agent-context feature, but it is still prompt injection from filesystem-derived strings.
- Malicious file or folder names can influence prompt text.
- The tree is depth-limited and capped, which reduces blast radius but does not remove the surface.

## Loop Behavior Summary

1. `streamAgentLoopWithTools()` starts from replayable in-memory history, appends runtime context when needed, and streams a turn.
2. Provider adapters serialize the message history differently:
   - OpenAI chat-completions keeps user messages as user/tool roles.
   - Codex groups tool results into a single user message envelope.
   - Anthropic, Google, and Mistral rebuild tool/user message structures in provider-native formats.
3. Tool execution always emits synthetic tool-result messages back into history.
4. The next turn receives that updated history, so any untrusted tool output can become model input on the following loop.

## Verification

I validated the relevant test paths with:
- `node --import tsx --test tests/openaiCompatible/messageHistory.test.ts tests/openaiCompatible/runtimeContext.test.ts tests/codex/codexAdapter.test.ts`

Results:
- `tests/openaiCompatible/runtimeContext.test.ts` passed.
- `tests/codex/codexAdapter.test.ts` passed.
- `tests/openaiCompatible/messageHistory.test.ts` failed in this environment because an imported Electron module attempted to load `app` from `electron` under plain Node. That is an environment/import issue, not evidence of a loop-security regression in the reviewed serialization code.

## Bottom Line

Yes, there are multiple places where user-controlled or workspace-controlled text is injected into the AI context during the tool loop. Most of it is intentional and required for an agentic workflow. The main security concern is not accidental injection, but the fact that the app treats tool outputs and replay wrappers as authoritative model input, which makes prompt-injection defense the primary hardening problem for this subsystem.
