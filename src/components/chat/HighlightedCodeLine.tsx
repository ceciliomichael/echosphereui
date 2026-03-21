import { memo, type ReactNode } from 'react'
import type { HighlightedCodeLine as HighlightedCodeLineData, HighlightedToken } from '../../lib/codeHighlighting'

interface HighlightedCodeLineProps {
  line: HighlightedCodeLineData
}

interface HighlightedCodeTokensProps {
  tokens: readonly HighlightedToken[]
}

function getTokenClassName(fontStyle: number | undefined) {
  if (!fontStyle) {
    return ''
  }

  return [fontStyle & 1 ? 'italic' : '', fontStyle & 2 ? 'font-semibold' : '', fontStyle & 4 ? 'underline' : '']
    .filter((value) => value.length > 0)
    .join(' ')
}

function renderTokenContent(tokens: readonly HighlightedToken[]): ReactNode {
  if (tokens.length === 0) {
    return '\u00A0'
  }

  return tokens.map((token, index) => (
    <span
      key={`${index}:${token.content.slice(0, 16)}:${token.color ?? ''}`}
      className={getTokenClassName(token.fontStyle)}
      style={token.color ? { color: token.color } : undefined}
    >
      {token.content}
    </span>
  ))
}

export const HighlightedCodeTokens = memo(function HighlightedCodeTokens({ tokens }: HighlightedCodeTokensProps) {
  return <>{renderTokenContent(tokens)}</>
})

export const HighlightedCodeLine = memo(function HighlightedCodeLine({ line }: HighlightedCodeLineProps) {
  return <HighlightedCodeTokens tokens={line.tokens} />
})
