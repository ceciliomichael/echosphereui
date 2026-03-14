import { formatSection } from './formatSection'

export function buildAgentToolMemorySection() {
  return formatSection('Tool Result Memory', [
    'Treat every tool result as authoritative source of truth.',
    'After successful write or edit, trust the mutation result for that path by default. Only reread when new information is genuinely needed.',
    'Do not repeat successful inspection calls (list/read/glob/grep) with the same arguments unless workspace state changed or a narrower scope is required.',
    'Reuse tool-result metadata and arguments from history before issuing additional tool calls.',
    'Each next tool call must be justified by new information needs, not reassurance.',
  ])
}
