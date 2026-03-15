import { formatSection } from './formatSection'

export function buildAgentTypingRulesSection() {
  return formatSection('Typing Rules', [
    'Use strict typing whenever the language supports it.',
    'Do not introduce any.',
    'Do not leave broad unknown at normal module boundaries. Narrow external or untrusted data immediately.',
    'Define explicit, precise types for public interfaces, exported functions, component props, return values, domain models, and shared contracts.',
    'Keep types close to the feature or module that owns them. Move them to a shared types location only when they are reused across features or define a stable cross-boundary contract.',
    'Prefer typed abstractions over implicit shapes or loosely typed object passing.',
    'Avoid type shortcuts that hide real data constraints.',
    'When interoperating with untyped libraries or external input, isolate the loose boundary and convert it into validated, typed data as early as possible.',
  ])
}
