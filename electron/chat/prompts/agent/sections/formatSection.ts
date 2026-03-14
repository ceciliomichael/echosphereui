export function formatSection(title: string, lines: readonly string[]) {
  const tagName = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return [`<${tagName}>`, ...lines.map((line) => `- ${line}`), `</${tagName}>`].join('\n')
}
