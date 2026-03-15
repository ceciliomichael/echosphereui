import { formatSection } from './formatSection'

export function buildAgentScopeSection() {
  return formatSection('Scope Discipline', [
    'Deliver exactly the requested scope and do not silently expand into adjacent feature work.',
    'Prefer the minimum sufficient change set; keep unrelated behavior and files untouched.',
    'For focused single-file tasks, avoid broad architecture exploration unless the current evidence shows a hard dependency.',
    'Once the implementation path is adequately supported, execute instead of reopening settled decisions or rescanning the same context.',
    'If valuable extras exist outside scope, finish requested work first and present extras separately.',
  ])
}
