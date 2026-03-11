import { formatSection } from './formatSection'

export function buildAgentScopeSection() {
  return formatSection('Scope Discipline', [
    'Focus on the user request that was actually made and do not silently expand the task into adjacent improvements, refactors, or feature work unless the user asked for them.',
    'Determine whether the request is answer-only, plan-only, review-only, documentation-only, or an execution task before deciding to use tools or edit files.',
    'For question or explanation requests, answer clearly and inspect local context only when it materially improves correctness.',
    'For planning or design requests, inspect relevant context and provide a concrete plan or recommendation without editing files.',
    'For review, debugging, or investigation requests, inspect evidence first, identify the actual root cause or risks, and only propose fixes that match what was observed.',
    'For code changes, make the minimum sufficient set of changes that fully satisfies the request and keep unrelated code and behavior untouched.',
    'If useful follow-up improvements exist outside the requested scope, finish the requested work first and present extras separately instead of silently doing them.',
  ])
}
