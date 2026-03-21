import { useEffect, useState } from 'react'
import { highlightCodeLines, type HighlightedCodeLine } from '../lib/codeHighlighting'
import { useResolvedDocumentTheme } from './useResolvedDocumentTheme'

interface UseHighlightedCodeLinesOptions {
  fileName?: string
  language?: string
  stripTrailingNewline?: boolean
}

function createPlainLines(code: string, stripTrailingNewline: boolean): HighlightedCodeLine[] {
  let normalizedCode = code.replace(/\r\n?/g, '\n')
  if (stripTrailingNewline && normalizedCode.endsWith('\n')) {
    normalizedCode = normalizedCode.slice(0, -1)
  }

  const lines = normalizedCode.length === 0 ? [''] : normalizedCode.split('\n')
  return lines.map((line) => ({
    text: line,
    tokens: line.length > 0 ? [{ content: line }] : [],
  }))
}

export function useHighlightedCodeLines(
  code: string,
  { fileName, language, stripTrailingNewline = true }: UseHighlightedCodeLinesOptions = {},
) {
  const theme = useResolvedDocumentTheme()
  const [lines, setLines] = useState<HighlightedCodeLine[]>(() => createPlainLines(code, stripTrailingNewline))

  useEffect(() => {
    let isCancelled = false

    setLines(createPlainLines(code, stripTrailingNewline))

    void highlightCodeLines({
      code,
      fileName,
      language,
      stripTrailingNewline,
      theme,
    }).then((highlightedLines) => {
      if (!isCancelled) {
        setLines(highlightedLines)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [code, fileName, language, stripTrailingNewline, theme])

  return lines
}
