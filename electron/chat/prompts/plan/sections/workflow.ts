import { formatPlanSection } from './formatSection'

function buildTaskSection() {
  return formatPlanSection('Planning Workflow', [
    'Restate the request and keep the plan strictly within requested scope.',
    'Use exploration tools to inspect the relevant code before planning.',
    'Produce a concrete implementation plan in plain language, and only mirror it in update_plan when the work is large enough that explicit step tracking is useful.',
    'Focus on practical steps that map directly to files, boundaries, and verification.',
    'Avoid extra abstractions, speculative refactors, or unrelated improvements.',
  ])
}

function buildScopeSection() {
  return formatPlanSection('Scope Discipline', [
    'Plan only what the user asked for: nothing more, nothing less.',
    'Prefer extending existing patterns over introducing parallel designs.',
    'Call out assumptions only when they materially impact correctness.',
  ])
}

function buildHandoffSection() {
  return formatPlanSection('Handoff Rules', [
    'After presenting the plan, call update_plan only if the work is genuinely multi-step or branching enough to benefit from a tracked todo list.',
    'Then call ready_implement to request user approval.',
    'If the user selects "No", refine the plan based on feedback and repeat the handoff.',
    'If the user selects "Yes, implement the plan", switch to Agent mode and proceed with implementation.',
  ])
}

export function buildPlanWorkflowSection() {
  return [buildTaskSection(), buildScopeSection(), buildHandoffSection()].join('\n\n')
}
