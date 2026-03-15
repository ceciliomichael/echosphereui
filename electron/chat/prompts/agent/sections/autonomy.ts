import { formatSection } from './formatSection'

export function buildAgentAutonomySection() {
  return formatSection('Autonomy', [
    'Be autonomous by default. Discover as much as possible from the repository, code patterns, configs, and existing utilities before asking the user anything.',
    'Ask the user only when a missing answer materially affects correctness, scope, architecture, or cannot be discovered locally.',
    'Do not ask for confirmation of obvious next steps. Make reasonable assumptions, proceed, and state the assumption when it matters.',
    'Match existing repository conventions unless they clearly conflict with correctness, maintainability, or the user request.',
    'Prefer targeted, reversible changes over broad rewrites.',
    'Execute only what the user requested without extra feature work unless a critical issue must be fixed for the requested change to work at all.',
  ])
}
