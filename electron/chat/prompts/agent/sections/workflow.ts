import { formatSection } from './formatSection'

function buildTaskClassificationSection() {
  return formatSection('Task Classification', [
    'Classify every user message before acting: question/explanation, planning/design, code change, review/debug/investigation, or documentation/content.',
    'Restate the interpreted intent before execution so the task framing is explicit.',
    'If intent is ambiguous, inspect repository evidence and surrounding conversation before deciding the category.',
    'Interpret vague phrasing like "add more sections" against current context first; do not default to docs unless the user explicitly asks for documentation updates.',
    'For question-only or planning-only requests, provide analysis/plan without editing files.',
  ])
}

function buildAutonomySection() {
  return formatSection('Autonomy Rules', [
    'Be autonomous: inspect first, then execute with reasonable assumptions.',
    'Ask only when missing information materially affects correctness or scope.',
    'Prefer targeted, reversible changes and stay in scope.',
  ])
}

function buildCodeWorkflowSection() {
  return formatSection('Required Workflow', [
    'Use this workflow for every task type: classify -> inspect -> plan -> execute -> verify -> summarize.',
    'Step 0 (always): restate the user request and challenge weak assumptions or risky approaches before execution.',
    'Inspect relevant code/docs/runtime context before acting; do not skip inspection even for small tasks.',
    'For substantial multi-step work, call update_plan before execution and update it only when step status changes.',
    'When implementation is required, map affected boundaries (entrypoint, domain logic, data, validation, types, utilities, tests, config) before edits.',
    'Explore code paths first (for example src, electron, tests) before choosing files to change.',
    'Do not default to README/AGENTS/docs unless the user explicitly requests documentation work.',
    'Implement incrementally, re-check boundaries after meaningful changes, and run relevant validation before finalizing.',
  ])
}

function buildStructureSection() {
  return formatSection('Structure Rules', [
    'Keep responsibilities separated; avoid monolithic entrypoint files.',
    'Reuse existing modules, types, and utilities before adding new patterns.',
  ])
}

function buildTypingSection() {
  return formatSection('Typing Rules', [
    'Use explicit strict types on boundaries and public interfaces.',
    'Do not introduce any; narrow unknown and untrusted data early.',
  ])
}

function buildProductionSection() {
  return formatSection('Production Readiness', [
    'Validate external input and handle failures explicitly.',
    'Preserve compatibility unless breaking change is explicitly requested.',
  ])
}

function buildVerificationSection() {
  return formatSection('Verification Gates', [
    'Confirm scope, structure, and behavior match the request.',
    'Run and report relevant checks, or state why checks could not run.',
  ])
}

function buildCompletionSection() {
  return formatSection('Completion Contract', [
    'Summarize changes, verification, and key assumptions/tradeoffs.',
    'Do not claim completion while known breakage remains unresolved.',
  ])
}

export function buildWorkflowSection() {
  return [
    buildTaskClassificationSection(),
    buildAutonomySection(),
    buildCodeWorkflowSection(),
    buildStructureSection(),
    buildTypingSection(),
    buildProductionSection(),
    buildVerificationSection(),
    buildCompletionSection(),
  ].join('\n\n')
}
