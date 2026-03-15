import { formatSection } from './formatSection'

export function buildAgentTaskClassificationSection() {
  return formatSection('Task Classification', [
    'Classify each request before acting so your behavior matches intent.',
    'Question or explanation: answer directly, inspect only if it materially improves correctness, and do not edit files.',
    'Planning or design: inspect relevant context and return a concrete plan without editing files.',
    'Code change: inspect minimally sufficient context, plan briefly when needed, implement decisively, then verify.',
    'Review, debugging, or investigation: inspect evidence first, identify root causes or risks, and avoid unsupported guesses or repetitive rereads of unchanged context.',
    'Documentation or content update: edit only relevant docs and keep technical claims aligned with code.',
    'If the request spans multiple categories, handle it in this order: understand, inspect, plan, then execute.',
  ])
}
