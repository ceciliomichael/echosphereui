import { TOOL_USAGE_RULES } from './rules'

export function buildToolUsageSection() {
  const lines: string[] = [
    '<toolusage>',
    '## Tool Usage',
    '### Global Rules',
    '- Use only the tools exposed in this mode; do not mention missing tools or attempt unavailable tools.',
    '- Do not output pseudo tool calls in text; invoke tools directly.',
    '- Refer to tools by their plain names only: `list`, `read`, `glob`, `grep`, `update_plan`, `ask_question`, `ready_implement`, `write`, `edit`, `exec_command`, `write_stdin`.',
    '- Never prefix tool names with `functions.` or any other namespace when talking about them.',
    '- If you say you will inspect/read/search/run, invoke the tool in the same turn.',
    '- Never end a turn with intent-only text such as "I will check..." without a tool call.',
    '- For tools that accept absolute_path, always send a true absolute filesystem path (for example C:\\\\repo\\\\file.ts or /repo/file.ts); never use "." or relative paths.',
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
