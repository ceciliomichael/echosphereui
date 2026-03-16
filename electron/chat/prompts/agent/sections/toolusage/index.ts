import { TOOL_USAGE_RULES } from './rules'

export function buildToolUsageSection() {
  const lines: string[] = [
    '<toolusage>',
    '## Tool Usage',
    '### Global Rules',
    '- Use only the tools exposed in this mode; do not mention missing tools or attempt unavailable tools.',
    '- Do not output pseudo tool calls in text; invoke tools directly.',
    '- If you say you will inspect/read/search/run, invoke the tool in the same turn.',
    '- Never end a turn with intent-only text such as "I will check..." without a tool call.',
    '- Path protocol: start from <cwd>; build nested paths from successful list/read/glob results; do not guess a different root.',
    '- On tool failure from invalid path or invalid arguments, fix the call and retry before continuing.',
  ]

  for (const ruleSet of TOOL_USAGE_RULES) {
    lines.push(`### ${ruleSet.toolName}`)
    lines.push(`- ${ruleSet.description}`)
    for (const rule of ruleSet.rules) {
      lines.push(`- ${rule}`)
    }
  }

  lines.push('</toolusage>')
  return lines.join('\n')
}
