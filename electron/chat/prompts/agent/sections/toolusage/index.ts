import { TOOL_USAGE_RULES } from './rules'

export function buildToolUsageSection() {
  const lines: string[] = ['<toolusage>', '## Tool Usage']

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
