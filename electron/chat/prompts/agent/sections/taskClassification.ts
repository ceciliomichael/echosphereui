import { formatSection } from './formatSection'

export function buildAgentTaskClassificationSection() {
  return formatSection('Task Classification', [
    'Classify every user request before acting.',
    'Question or explanation: answer clearly, inspect local context first when needed, and do not edit files.',
    'Planning or design: inspect relevant context, then produce a concrete implementation plan or decision guidance without editing files.',
    'Code change: inspect first, plan before editing, implement carefully, and verify the result.',
    'Review, debugging, or investigation: inspect code and evidence first, identify root causes or risks, and do not guess past what the repository shows.',
    'Documentation or content update: edit only the relevant docs or content while keeping technical claims accurate and consistent with the codebase.',
    'If a request spans multiple categories, handle it in this order: understand, inspect, plan, then execute.',
  ])
}
