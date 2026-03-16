interface TerminalToolResultProps {
  content: string
  isStreaming: boolean
  toolName: 'exec_command' | 'write_stdin'
}

function getTerminalResultLabel(toolName: TerminalToolResultProps['toolName']) {
  return toolName === 'exec_command' ? 'Command output' : 'Session output'
}

export function TerminalToolResult({ content, isStreaming, toolName }: TerminalToolResultProps) {
  const hasContent = content.trim().length > 0

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="px-3 py-2 text-[12px] font-medium text-muted-foreground">{getTerminalResultLabel(toolName)}</div>
      <div className="border-t border-border bg-surface-muted/55 p-3">
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-foreground/90">
          {hasContent ? content : isStreaming ? 'Awaiting terminal output...' : 'No terminal output.'}
        </pre>
      </div>
    </div>
  )
}
