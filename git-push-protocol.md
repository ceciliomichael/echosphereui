# Git Push Protocol (No Follow-Up Questions)

Use this trigger:

`Follow docs/git-push-protocol.md`

## Default Behavior (Required)

- Do not ask whether to include unrelated tracked file changes.
- Always stage and commit all tracked changes in the working tree for that push.
- Keep this as the default every time this protocol is referenced.

## Execution Steps

1. Confirm intent in one sentence.
2. Fetch latest `main`.
3. Create a branch from `main` with a clear short name.
4. Run checks (`npx tsc --noEmit`, `npm run build`, plus task-specific checks).
5. Commit all tracked changes using the required commit format below.
6. Push branch.
7. Open PR to `main` using the required PR template below.
8. Merge PR only when validation status is clearly documented.
9. Keep branch unless explicitly told to delete it.

## Required Commit Format

- Subject: Conventional Commit style, one line, specific.
- Body is mandatory and must include:
  - `What:` concrete file-level or behavior-level changes.
  - `Why:` business/technical reason.
  - `Validation:` checks run and result.
  - `Risk:` known risk or `none`.

Example:

`fix: align realtime echo behavior for image sends`

`What: emit immediate message_echo for image/text send routes and propagate clientTempId for deterministic reconcile.`
`Why: reduce pending-message delay and avoid fuzzy matching race conditions.`
`Validation: npx tsc --noEmit (pass), npm run build (pass).`
`Risk: webhook fallback still used if provider does not return message_id.`

## Required PR Template

- Title: `<type>: <short change>`
- Body sections (all required):
  - `Context`
  - `What Changed`
  - `Why`
  - `Validation`
  - `Risk`
  - `Follow-Ups` (use `none` if empty)

## Merge Gate

- Do not merge with a thin/placeholder commit or PR description.
- If details are missing, update commit message and/or PR body before merge.
- If checks fail, report failures and merge risk; only proceed when explicitly instructed.

## Safety Rules

- Never commit directly to `main`.
- Never run destructive commands (`reset --hard`, force push, branch delete) unless explicitly requested.
- Never commit secrets or `.env` values.

## Naming

- Branch: `<type>/<short-task-name>`
- PR title: `<type>: <short change>`

## Required Final Output

1. Branch name
2. Commit hash
3. PR link
4. Merge commit hash
5. Explicit note that branch was kept
