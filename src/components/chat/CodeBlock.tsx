import { Check, Copy } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { resolveFileIconConfig } from '../../lib/fileIconResolver'

interface CodeBlockProps {
  code: string
  fileName?: string
  language?: string
  isStreaming?: boolean
}

interface TokenizedCode {
  gutterWidthCh: number
  lines: string[]
}

function toLanguageLabel(language: string | undefined, resolvedLabel: string) {
  if (!language || language.trim().length === 0) {
    return 'Text'
  }

  if (resolvedLabel !== 'Code') {
    return resolvedLabel
  }

  const normalized = language.trim()
  return normalized.length <= 4 ? normalized.toUpperCase() : normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function tokenizeCode(code: string): TokenizedCode {
  const normalizedCode = code.replace(/\n$/, '')
  const lines = normalizedCode.length === 0 ? [''] : normalizedCode.split('\n')
  const gutterWidthCh = Math.max(String(lines.length).length + 1, 3)

  return {
    gutterWidthCh,
    lines,
  }
}

interface CodeRowsProps {
  code: string
}

const CodeRows = memo(function CodeRows({ code }: CodeRowsProps) {
  const tokenizedCode = useMemo(() => tokenizeCode(code), [code])

  return (
    <div className="flex min-w-0 bg-surface">
      <div className="shrink-0 border-r border-border bg-background/70">
        <pre className="m-0 py-2 text-[12px] leading-5 text-subtle-foreground">
          <code className="block">
            {tokenizedCode.lines.map((_, index) => (
              <div
                key={`line-number-${index + 1}`}
                className="select-none px-2 text-right"
                style={{ minWidth: `${tokenizedCode.gutterWidthCh}ch` }}
              >
                {index + 1}
              </div>
            ))}
          </code>
        </pre>
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <pre className="m-0 min-w-full bg-transparent px-3 py-2 text-[12px] leading-5 text-foreground">
          <code className="block w-fit min-w-full bg-transparent">
            {tokenizedCode.lines.map((line, index) => (
              <div key={`content-${index}-${line.slice(0, 16)}`} className="whitespace-pre">
                {line.length > 0 ? line : '\u00A0'}
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
})

export const CodeBlock = memo(function CodeBlock({ code, fileName, language, isStreaming = false }: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false)
  const iconConfig = resolveFileIconConfig({ fileName, languageId: language })
  const titleLabel = fileName ?? toLanguageLabel(language, iconConfig.label)
  const LanguageIcon = iconConfig.icon

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
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2">
        <span className="inline-flex min-h-4 items-center gap-2 text-[12px] font-medium text-muted-foreground">
          <span className="flex h-4 w-4 items-center justify-center">
            <LanguageIcon size={14} style={{ color: iconConfig.color }} aria-hidden="true" />
          </span>
          <span className="flex h-4 items-center leading-[1]">{titleLabel}</span>
        </span>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-[color,transform] hover:scale-105 hover:text-foreground"
          aria-label={isCopied ? 'Copied code' : 'Copy code'}
          title={isCopied ? 'Copied' : 'Copy'}
        >
          {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      <CodeRows code={code} key={isStreaming ? `streaming:${code.length}` : 'static'} />
    </div>
  )
})
