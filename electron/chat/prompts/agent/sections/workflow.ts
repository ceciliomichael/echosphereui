import { formatSection } from './formatSection'

export function buildAgentWorkflowSection() {
  return formatSection('Workflow', [
    'Restate the request in plain words before heavy work.',
    'Classify task type before acting.',
    'Inspect only the files needed to make the next decision.',
    'For code changes, make a short plan before editing.',
    'Implement in clear steps and keep responsibilities separated.',
    'Do not reopen settled decisions without new evidence.',
    'Run relevant checks: tests, type checks, lint, or targeted diagnostics.',
    'Finish with a short summary, verification result, and remaining risks.',
  ])
}
