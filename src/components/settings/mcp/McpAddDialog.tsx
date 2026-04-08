import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Plus, X } from 'lucide-react'
import { DropdownField, type DropdownOption } from '../../ui/DropdownField'
import { PRIMARY_ACTION_BUTTON_CLASS_NAME } from '../shared/actionButtonStyles'
import { LineNumberedTextarea } from '../shared/LineNumberedTextarea'
import type { McpAddServerInput, McpAddServerTransportType } from '../../../types/mcp'

interface McpAddDialogProps {
  errorMessage: string | null
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (input: McpAddServerInput) => Promise<boolean>
}

const TYPE_OPTIONS: readonly DropdownOption[] = [
  { label: 'Stdio', value: 'stdio' },
  { label: 'Streamable HTTP', value: 'streamable-http' },
] as const

function parseTextList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseKeyValueLines(value: string) {
  const result: Record<string, string> = {}
  const lines = value.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      throw new Error('Entries must use KEY=value format.')
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const entryValue = trimmed.slice(separatorIndex + 1).trim()
    if (key.length === 0 || entryValue.length === 0) {
      throw new Error('Entries must use KEY=value format.')
    }

    result[key] = entryValue
  }

  return result
}

export function McpAddDialog({ errorMessage, isSubmitting, onClose, onSubmit }: McpAddDialogProps) {
  const [serverName, setServerName] = useState('')
  const [serverType, setServerType] = useState<McpAddServerTransportType>('stdio')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [envText, setEnvText] = useState('')
  const [url, setUrl] = useState('')
  const [headersText, setHeadersText] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isSubmitting, onClose])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)

    const normalizedServerName = serverName.trim()
    if (normalizedServerName.length === 0) {
      setLocalError('Server name is required.')
      return
    }

    try {
      const normalizedCommand = command.trim()
      const normalizedUrl = url.trim()
      const input: McpAddServerInput =
        serverType === 'stdio'
          ? {
              args: parseTextList(argsText),
              command: normalizedCommand,
              env: parseKeyValueLines(envText),
              serverName: normalizedServerName,
              type: serverType,
            }
          : {
              headers: parseKeyValueLines(headersText),
              serverName: normalizedServerName,
              type: serverType,
              url: normalizedUrl,
            }

      if (serverType === 'stdio' && normalizedCommand.length === 0) {
        setLocalError('Command is required for stdio servers.')
        return
      }

      if (serverType === 'streamable-http' && normalizedUrl.length === 0) {
        setLocalError('URL is required for streamable HTTP servers.')
        return
      }

      const didSubmit = await onSubmit(input)
      if (!didSubmit) {
        return
      }

      setServerName('')
      setServerType('stdio')
      setCommand('')
      setArgsText('')
      setEnvText('')
      setUrl('')
      setHeadersText('')
      onClose()
    } catch (error) {
      setLocalError(error instanceof Error && error.message.trim().length > 0 ? error.message : 'Unable to add the MCP server.')
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/12 px-4 py-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-add-dialog-title"
        className="flex h-[min(42rem,calc(100dvh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 pt-5 pb-3">
          <div className="min-w-0">
            <h2 id="mcp-add-dialog-title" className="text-lg font-semibold text-foreground">
              Add MCP
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Add one server at a time. Stdio is for local subprocesses. Streamable HTTP is for remote servers.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close Add MCP dialog"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="mcp-server-name" className="text-sm font-medium text-foreground">
                Server name
              </label>
              <input
                id="mcp-server-name"
                ref={nameRef}
                type="text"
                value={serverName}
                onChange={(event) => setServerName(event.target.value)}
                placeholder="my-local-server"
                className="h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="mcp-server-type" className="text-sm font-medium text-foreground">
                Type
              </label>
              <DropdownField
                id="mcp-server-type"
                ariaLabel="MCP server type"
                className="w-full"
                triggerClassName="chat-runtime-control-trigger h-11 w-full justify-between rounded-xl border-border bg-surface-muted px-3 text-sm text-foreground shadow-none"
                disabled={isSubmitting}
                value={serverType}
                onChange={(value) => setServerType(value as McpAddServerTransportType)}
                options={TYPE_OPTIONS}
              />
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {serverType === 'stdio' ? (
              <>
                <div className="space-y-2">
                  <label htmlFor="mcp-command" className="text-sm font-medium text-foreground">
                    Command
                  </label>
                  <input
                    id="mcp-command"
                    type="text"
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder="node"
                    className="h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    disabled={isSubmitting}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    This is the executable used to launch the local MCP process.
                  </p>
                </div>

                <LineNumberedTextarea
                  id="mcp-args"
                  label="Arguments"
                  value={argsText}
                  onChange={setArgsText}
                  placeholder="/path/to/server.js"
                  disabled={isSubmitting}
                  rows={4}
                  showLineNumbers={false}
                  description="Put one argument per line. Long entries wrap naturally."
                />

                <LineNumberedTextarea
                  id="mcp-env"
                  label="Environment"
                  value={envText}
                  onChange={setEnvText}
                  placeholder="API_KEY=your-api-key"
                  disabled={isSubmitting}
                  rows={4}
                  showLineNumbers={false}
                  description="Put one KEY=value pair per line."
                />
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="mcp-url" className="text-sm font-medium text-foreground">
                    URL
                  </label>
                  <input
                    id="mcp-url"
                    type="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://example.com/mcp"
                    className="h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    disabled={isSubmitting}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    This is the remote MCP endpoint.
                  </p>
                </div>

                <LineNumberedTextarea
                  id="mcp-headers"
                  label="Headers"
                  value={headersText}
                  onChange={setHeadersText}
                  placeholder="Authorization=Bearer your-token"
                  disabled={isSubmitting}
                  rows={4}
                  showLineNumbers={false}
                  description="Put one KEY=value pair per line."
                />
              </>
            )}
          </div>

          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Typical MCP usage is either a local process launched with stdio or a remote hosted server over streamable HTTP. Keep the server name short and unique so it is easy to recognize in the settings list.
          </p>

          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            This form writes a single literal server entry to `mcp.json`.
          </p>

          {localError || errorMessage ? (
            <div className="mt-4 rounded-xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-foreground">
              {errorMessage ?? localError}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-surface-muted px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`${PRIMARY_ACTION_BUTTON_CLASS_NAME} h-10`}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add MCP
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
