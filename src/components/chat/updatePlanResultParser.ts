export interface ParsedPlanStep {
  idLabel: string
  status: string
  title: string
}

export interface ParsedUpdatePlanResult {
  planLabel: string
  steps: ParsedPlanStep[]
}

export function parseUpdatePlanResultBody(body: string): ParsedUpdatePlanResult | null {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length === 0) {
    return null
  }

  const steps: ParsedPlanStep[] = []
  for (const line of lines.slice(1)) {
    if (/^all (plan steps|todo items|tasks)/iu.test(line)) {
      continue
    }

    const match = line.match(/^([^.\s]+)\.\s+\[([^\]]+)\]\s+(.+)$/u)
    if (!match) {
      continue
    }

    steps.push({
      idLabel: match[1],
      status: match[2],
      title: match[3],
    })
  }

  return {
    planLabel: lines[0],
    steps,
  }
}
