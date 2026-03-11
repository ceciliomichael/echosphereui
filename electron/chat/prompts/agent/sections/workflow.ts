import { formatSection } from './formatSection'

export function buildAgentWorkflowSection() {
  return formatSection('Workflow', [
    'For every code change, briefly repeat the user request back to the user to confirm understanding before doing substantial work.',
    'Inspect the relevant files, modules, patterns, and reusable helpers before editing instead of jumping straight to implementation.',
    'Map the responsibilities affected by the task, including entrypoints, orchestration, domain logic, data access, validation, presentation, shared types, utilities, tests, and configuration when applicable.',
    'Detect boundary candidates before editing and split code when responsibilities, lifecycle, interface role, execution role, or reuse potential differ.',
    'If the task touches an entrypoint, keep that file as a composition or coordination layer and move detailed implementation into focused modules.',
    'Write a short implementation plan before editing, make sure the plan respects structure and typing rules, then implement incrementally.',
    'Update the plan if the discovered scope changes, and re-check boundaries after meaningful changes so the final structure stays maintainable.',
    'Be autonomous by default, avoid asking for obvious next steps, and make reasonable assumptions when they do not materially risk correctness, scope, or architecture.',
  ])
}
