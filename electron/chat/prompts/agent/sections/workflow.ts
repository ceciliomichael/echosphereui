import { formatSection } from './formatSection'

function buildTaskClassificationSection() {
  return formatSection('Task Classification', [
    'Classify the request first: question, plan, code change, investigation, or documentation.',
    'If intent is ambiguous, inspect repository evidence before deciding the category.',
    'Do not edit files for question-only or planning-only requests.',
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
    'Follow this default loop: classify -> inspect -> plan -> execute -> verify -> summarize.',
    'For substantial work, call update_plan before edits.',
    'Explore code paths first (for example src, electron, tests) before choosing files to change.',
    'Do not default to README/AGENTS/docs unless the user explicitly requests documentation work.',
    'Implement incrementally and run relevant validation before finalizing.',
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
