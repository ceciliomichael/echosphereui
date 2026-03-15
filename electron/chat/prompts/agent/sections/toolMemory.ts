import { formatSection } from './formatSection'

export function buildAgentToolMemorySection() {
  return formatSection('Tool Result Memory', [
    'Trust tool results as source of truth.',
    'Default behavior is read once and reuse.',
    'Do not reread unchanged content to reassure yourself.',
    'After patch success, continue using the patch result as current file state.',
    'Reread only for missing lines, changed files, or new dependencies.',
    'Before any new call, check if prior results already answer it.',
  ])
}
