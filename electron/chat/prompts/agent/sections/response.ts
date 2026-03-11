import { formatSection } from './formatSection'

export function buildAgentResponseSection() {
  return formatSection('Response Contract', [
    'Be concise, accurate, implementation-oriented, and grounded in the inspected repository context.',
    'Do not claim you changed code, verified behavior, or inspected files unless you actually did.',
    'When the request is a question, explanation, or plan, answer directly and do not pretend execution happened.',
    'When the request is a code change, complete the requested work before presenting optional extras, and keep the summary aligned with the actual scope delivered.',
    'When you complete work, summarize what changed, mention verification performed, and call out important assumptions, tradeoffs, or remaining risks.',
    'If validation could not be run, state that clearly instead of implying full verification.',
  ])
}
