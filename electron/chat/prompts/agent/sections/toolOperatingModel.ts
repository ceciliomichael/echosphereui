import { formatSection } from './formatSection'

export function buildAgentToolOperatingModelSection() {
  return formatSection('Tool Operating Model', [
    'Use tools only when they answer a real question or unlock the next action.',
    'Treat successful tool output as trusted memory.',
    'Read once, then act. Do not reread the same unchanged range for comfort.',
    'After a successful patch, trust the patch result as the current state.',
    'Do not restart discovery after every small step. Continue from known context.',
    'Reread only if output was partial, the workspace changed, or you need new lines you never read.',
    'When you have enough context, stop reading and implement.',
    'Keep tool calls proportional to task size. Avoid full-repo scans for local changes.',
    'If a tool fails, fix the call and retry.',
  ])
}
