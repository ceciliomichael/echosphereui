# EchoSphere

EchoSphere is a desktop AI coding workspace built with Electron, React, and TypeScript. It combines threaded chat, tool-enabled coding workflows, project-aware context, source control actions, and an integrated terminal in a single app.

## What the App Does

EchoSphere is designed for day-to-day software development work, not just chat.

- Runs AI conversations as persistent threads with folder grouping.
- Supports provider-backed assistant streaming with tool execution.
- Lets you edit/revert user turns and restore workspace checkpoints during agent runs.
- Integrates Git status, diff, staging, commit, push, and PR-oriented flows.
- Includes an embedded terminal panel scoped by workspace.
- Persists workspace, thread, and UI settings across sessions.

## Core Capabilities

### Chat and Agent Workflows

- Threaded conversations with rename/delete and folder organization.
- Inline editing of previous user messages.
- Revert-to-checkpoint behavior tied to user turns.
- Streaming assistant output with tool call traces.
- Context usage estimation in composer.

### Provider Support

- Codex (OAuth account flow)
- OpenAI (API key)
- Anthropic (API key)
- Google (API key)
- OpenAI-compatible endpoints (API key + base URL)

### Source Control

- Branch view/switch/create
- Diff panel for staged/unstaged changes
- Stage/unstage/discard file changes
- Commit modal with quick commit paths
- Push/PR-aware flows in the git services layer

### Terminal

- Embedded terminal panel powered by `node-pty`
- Per-workspace terminal open state and panel height persistence
- External link handling from terminal output

## Tech Stack

- Electron 30
- React 18 + TypeScript
- Vite 5
- Tailwind CSS 4
- node-pty for terminal sessions
- Multiple provider SDK integrations (`openai`, `@anthropic-ai/sdk`, `@google/genai`)

## Requirements

- Node.js 20+ recommended
- npm 10+
- Windows, Linux, or macOS

## Getting Started

```bash
npm install
npm run dev
```

This starts the renderer and Electron main/preload through the Vite Electron plugin setup.

## Build and Package

```bash
npm run build
npm run dist
```

Platform-specific packaging scripts are also available:

- `npm run dist:win`
- `npm run dist:linux`
- `npm run dist:mac`

## Release Automation

Use the automation wrappers to bump version, create a release commit, tag it, and push.
Pushing the tag triggers the GitHub Actions release workflow.

Windows (PowerShell/CMD):

```bat
automations\release.bat
automations\release.bat patch
automations\release.bat minor
automations\release.bat 0.2.0
```

macOS/Linux:

```bash
./automations/release.sh
./automations/release.sh patch
./automations/release.sh minor
./automations/release.sh 0.2.0
```

Optional flags are forwarded to the release script:

- `--allow-dirty` to bypass clean-working-tree checks
- `--remote <name>` to push to a different git remote

Direct script usage (without commit/tag/push):

```bash
node ./scripts/release-version.mjs --bump patch
node ./scripts/release-version.mjs --version 0.2.0
```

## Quality Checks

```bash
npm run typecheck
npm run lint
npm run test:tools
```

## Provider Configuration

Configure providers in the app Settings screen.

- Codex uses OAuth and stores auth material in `~/.codex/auth.json`.
- API-key providers are stored in `~/.echosphere/config/providers.json`.

## Data and Storage

EchoSphere stores local state under your home directory:

- `~/.echosphere/history`
  - conversation JSON files
  - `messages.jsonl`
  - `folders.json`
  - workspace checkpoint data
- `~/.echosphere/config`
  - `settings.json`
  - `providers.json`
- `~/.codex/auth.json`
  - Codex OAuth credentials

Files are written with restrictive permissions where supported (`0o600` for sensitive auth/provider files).

## Repository Structure

```text
src/
  components/         React UI primitives and feature components
  hooks/              Chat/runtime/state workflows
  pages/              Top-level screens (Chat, Settings)
  lib/                Shared utilities and UI/system helpers
  types/              Shared app and IPC types

electron/
  main.ts             Electron app bootstrap + IPC handlers
  preload.ts          Renderer-safe API bridge
  chat/               Provider runtime and streaming orchestration
  git/                Git operations and commit/sync services
  history/            Conversation/folder persistence
  settings/           App settings persistence and bootstrap
  terminal/           PTY session lifecycle
  workspace/          Checkpoint creation/restore logic

tests/
  openaiCompatible/   Tooling and runtime behavior tests
  codex/              Codex adapter and git-related tests
```

## Runtime Architecture (High Level)

1. Renderer sends typed IPC requests through `window.echosphere*` APIs.
2. Electron main routes requests to services (`chat`, `git`, `history`, `terminal`, `settings`, `workspace`).
3. Chat provider adapters stream events back over `chat:stream:event`.
4. Renderer hooks update thread state, messages, tool traces, and UI panels.

## Notes for Contributors

- Keep renderer logic in `src/` and privileged IO/process logic in `electron/`.
- Prefer existing hooks/services patterns over adding parallel flows.
- Run typecheck, lint, and tool tests before submitting changes.
