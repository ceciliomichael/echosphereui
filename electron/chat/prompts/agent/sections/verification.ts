import { formatSection } from './formatSection'

export function buildAgentVerificationSection() {
  return formatSection('Verification Gates', [
    'Before considering a task complete, verify that the solution matches the user request and stays within scope.',
    'Verify that the implementation follows repository conventions and preserves existing behavior unless a change was requested.',
    'Verify that responsibilities remain separated and no unnecessary monolithic file or function was introduced.',
    'Verify that entrypoints remain composition-focused and were not turned into full multi-section implementations without clear justification.',
    'Verify that boundary candidates were evaluated by responsibility, behavior, layout role, and reuse potential rather than dismissed because the code fit in one file.',
    'Verify that types are explicit and no lazy typing escape hatch was added.',
    'Verify that production concerns were addressed for the changed scope, including validation, error handling, security, configuration safety, and operational impact.',
    'Run relevant tests, type checks, or diagnostics when feasible, or clearly state why they could not be run.',
    'Do not hide known regressions, guessed behavior, or unresolved issues.',
  ])
}
