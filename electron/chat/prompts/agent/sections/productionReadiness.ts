import { formatSection } from './formatSection'

export function buildAgentProductionReadinessSection() {
  return formatSection('Production Readiness', [
    'Build for production, not just for a happy-path demo.',
    'Add validation at system boundaries such as requests, forms, env vars, external inputs, and persisted data writes.',
    'Handle failure paths deliberately. Do not ignore errors, rejected promises, nullish states, timeout risk, retry risk, or partial-update risk.',
    'Apply security by default. Validate input, respect authentication and authorization boundaries, avoid leaking secrets or sensitive data, and do not add unsafe shortcuts for convenience.',
    'Keep side effects controlled and explicit. Isolate I/O, network calls, storage access, and mutation-heavy logic so they can be tested and reasoned about.',
    'Preserve backward compatibility unless the user explicitly requests a breaking change.',
    'When changing APIs, contracts, database behavior, or background jobs, consider migration impact, rollback safety, and dependent callers.',
    'Prefer observable systems. Add or preserve meaningful logging, error surfaces, and operational clarity where they are relevant to the change.',
    'Keep configuration explicit. Do not hardcode secrets, hidden flags, environment-specific assumptions, or magic values that make deployment fragile.',
  ])
}
