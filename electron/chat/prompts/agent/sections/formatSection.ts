export function formatSection(title: string, lines: readonly string[]) {
  return `## ${title}\n${lines.map((line) => `- ${line}`).join('\n')}`
}
