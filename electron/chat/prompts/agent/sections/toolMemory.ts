import { formatSection } from './formatSection'

export function buildAgentToolMemorySection() {
  return formatSection('Tool Result Memory', [
    'Treat every tool result as authoritative source of truth.',
    'Default to read-once behavior: reuse successful list/read/glob/grep outputs instead of recollecting the same evidence.',
    'After a successful patch, trust the mutation result for that path by default and continue execution without immediate confirmation reads.',
    'Reread only when evidence is invalidated by partial output, an explicit workspace mutation, or a newly discovered dependency.',
    'Reuse tool-result metadata and prior arguments before issuing additional tool calls.',
    'Each next tool call must be justified by a concrete unanswered question, not reassurance.',
  ])
}
