import { Check, Copy } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'

interface CodeBlockProps {
  code: string
  language?: string
  isStreaming?: boolean
}

function toLanguageLabel(language: string | undefined) {
  if (!language || language.trim().length === 0) {
    return 'Text'
  }

  const normalized = language.trim()
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export const CodeBlock = memo(function CodeBlock({ code, language, isStreaming = false }: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false)
  const languageLabel = toLanguageLabel(language)

  useEffect(() => {
    if (!isCopied) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setIsCopied(false)
    }, 1400)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isCopied])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setIsCopied(true)
    } catch {
      setIsCopied(false)
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-surface-muted">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">{languageLabel}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          aria-label={isCopied ? 'Copied code' : 'Copy code'}
          title={isCopied ? 'Copied' : 'Copy'}
        >
          {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-[1.55] text-foreground">
        {isStreaming ? <CodeBlockContent code={code} /> : <code>{code}</code>}
      </pre>
    </div>
  )
})

interface TokenizedCodeLine {
  id: string
  text: string
}

interface CodeBlockContentProps {
  code: string
}

const CodeBlockContent = memo(function CodeBlockContent({ code }: CodeBlockContentProps) {
  const tokenizedLines = useMemo(() => tokenizeCode(code), [code])

  return (
    <code>
      {tokenizedLines.map((line, index) => (
        <CodeLineToken
          key={line.id}
          lineText={line.text}
          hasTrailingNewline={index < tokenizedLines.length - 1}
        />
      ))}
    </code>
  )
})

interface CodeLineTokenProps {
  lineText: string
  hasTrailingNewline: boolean
}

const CodeLineToken = memo(function CodeLineToken({ lineText, hasTrailingNewline }: CodeLineTokenProps) {
  return (
    <span>
      {lineText}
      {hasTrailingNewline ? '\n' : ''}
    </span>
  )
})

function tokenizeCode(code: string): TokenizedCodeLine[] {
  const lines = code.split('\n')
  return lines.map((line, index) => ({
    id: `${index}:${line}`,
    text: line,
  }))
}
