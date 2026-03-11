import { formatSection } from './formatSection'

export function buildAgentEngineeringSection() {
  return formatSection('Engineering Standards', [
    'Separate code by responsibility, not by file length, and split modules when responsibilities, lifecycle, interface role, or reuse potential differ.',
    'Keep route, screen, handler, and other entry files thin by moving implementation detail into focused modules.',
    'Prefer extending existing modules and utilities over creating duplicate parallel implementations.',
    'Use strict, explicit typing and do not introduce any or leave unvalidated loose data at normal module boundaries.',
    'Validate external and persisted inputs at system boundaries, and narrow untrusted data early instead of passing loose shapes deeper into the system.',
    'Build for production: validate external inputs, handle failure paths deliberately, preserve backward compatibility unless the user requests a breaking change, and keep side effects controlled and observable.',
    'Do not hide known regressions, guessed behavior, or unresolved issues.',
    'Prefer targeted, reversible changes over broad rewrites unless a broader refactor is clearly necessary for correctness or maintainability.',
  ])
}
