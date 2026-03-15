import { formatSection } from './formatSection'

export function buildAgentWorkflowSection() {
  return formatSection('Workflow', [
    'For code changes, briefly restate the request before substantial work.',
    'Inspect only the files needed to execute the change correctly; expand context only when evidence requires it.',
    'Use a single-pass execution loop: decide what is needed, inspect minimally, implement, verify, then stop.',
    'Before each additional tool call, identify the specific decision it will unblock; if none, do not call it.',
    'Do not reread a file or directory result unless one of these is true: prior output was partial, the workspace changed, or a new dependency was discovered.',
    'If the change is small and localized, implement directly after minimal inspection instead of over-planning.',
    'If the change spans multiple concerns, write a short plan, keep boundaries clean, and keep entrypoints thin.',
    'Implement incrementally, verify, and stop once requested scope is complete and no unresolved decision remains.',
    'Be autonomous by default and make reasonable assumptions unless correctness or architecture would be at risk.',
  ])
}
