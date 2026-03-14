import { formatSection } from './formatSection'

export function buildAgentWorkflowSection() {
  return formatSection('Workflow', [
    'For code changes, briefly restate the request before substantial work.',
    'Inspect only the files needed to execute the change correctly; expand context only when evidence requires it.',
    'If the change is small and localized, implement directly after minimal inspection instead of over-planning.',
    'If the change spans multiple concerns, write a short plan, keep boundaries clean, and keep entrypoints thin.',
    'Implement incrementally, verify, and stop once requested scope is complete.',
    'Be autonomous by default and make reasonable assumptions unless correctness or architecture would be at risk.',
  ])
}
