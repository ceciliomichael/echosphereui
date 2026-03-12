import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type CSSProperties, type KeyboardEvent } from 'react'
import { ArrowUp, Paperclip, Square } from 'lucide-react'
import { CHAT_ATTACHMENT_INPUT_ACCEPT, readChatAttachmentsFromFiles } from '../lib/chatAttachmentFiles'
import { chatInputSurfaceClassName } from '../lib/chatStyles'
import { Tooltip } from './Tooltip'
import { ChatModeSelectorField, type ChatModeOption } from './chat/ChatModeSelectorField'
import { ModelSelectorField, type ModelSelectorOption } from './chat/ModelSelectorField'
import { ReasoningEffortBlock } from './chat/ReasoningEffortBlock'
import type { ChatAttachment, ChatMode, ReasoningEffort } from '../types/chat'
import { AttachmentPillList } from './chat/AttachmentPillList'

interface ChatInputProps {
  attachments?: ChatAttachment[]
  chatModeOptions?: readonly ChatModeOption[]
  chatModeSelectorDisabled?: boolean
  disabled?: boolean
  focusSignal?: number
  isEditing?: boolean
  isStreaming?: boolean
  modelOptions?: readonly ModelSelectorOption[]
  onAbort?: () => void
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void
  onCancelEdit?: () => void
  onChatModeChange?: (mode: ChatMode) => void
  onModelChange?: (modelId: string) => void
  onReasoningEffortChange?: (effort: ReasoningEffort) => void
  onSend: () => void
  selectedChatMode?: ChatMode
  reasoningEffort?: ReasoningEffort
  reasoningEffortOptions?: readonly ReasoningEffort[]
  selectedModelId?: string
  showReasoningEffortSelector?: boolean
  value: string
  onValueChange: (value: string) => void
  sendOnEnter?: boolean
  variant?: 'composer' | 'inline'
}

export function ChatInput({
  attachments = [],
  value,
  onValueChange,
  onSend,
  onCancelEdit,
  chatModeOptions = [],
  chatModeSelectorDisabled = false,
  modelOptions = [],
  onChatModeChange,
  onModelChange,
  onReasoningEffortChange,
  isEditing = false,
  isStreaming = false,
  selectedChatMode = 'agent',
  reasoningEffort = 'medium',
  reasoningEffortOptions = [],
  selectedModelId = '',
  showReasoningEffortSelector = false,
  sendOnEnter = true,
  variant = 'composer',
  focusSignal,
  disabled = false,
  onAbort,
  onAttachmentsChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const isInline = variant === 'inline'
  const canManageAttachments = typeof onAttachmentsChange === 'function'
  const showChatModeSelector = chatModeOptions.length > 0 && typeof onChatModeChange === 'function'
  const showModelSelector = modelOptions.length > 0 && typeof onModelChange === 'function'
  const showReasoningControl = showReasoningEffortSelector && typeof onReasoningEffortChange === 'function'
  const showRuntimeControls = canManageAttachments || showChatModeSelector || showModelSelector || showReasoningControl
  const canAbort = isStreaming && typeof onAbort === 'function'

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled

  function handleSend() {
    if (!canSend) return
    onSend()
  }

  function handleAbort() {
    if (!canAbort) {
      return
    }

    onAbort()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (sendOnEnter && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }

    if (!sendOnEnter && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }

    if (e.key === 'Escape' && isEditing && onCancelEdit) {
      e.preventDefault()
      onCancelEdit()
    }
  }

  async function handleAttachments(files: readonly File[]) {
    if (!canManageAttachments || disabled || files.length === 0) {
      return
    }

    const result = await readChatAttachmentsFromFiles(files, attachments.length)
    if (result.attachments.length > 0) {
      onAttachmentsChange?.([...attachments, ...result.attachments])
      textareaRef.current?.focus()
    }

    setAttachmentError(result.errors[0] ?? null)
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!canManageAttachments || disabled) {
      return
    }

    const files = Array.from(event.clipboardData.files)
    if (files.length === 0) {
      return
    }

    event.preventDefault()
    void handleAttachments(files)
  }

  function handleManualAttachClick() {
    if (!canManageAttachments || disabled) {
      return
    }

    fileInputRef.current?.click()
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void handleAttachments(files)
  }

  function handleRemoveAttachment(attachmentId: string) {
    if (!canManageAttachments) {
      return
    }

    onAttachmentsChange?.(attachments.filter((attachment) => attachment.id !== attachmentId))
    setAttachmentError(null)
  }

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  useEffect(() => {
    handleInput()
  }, [value])

  useEffect(() => {
    if (focusSignal === undefined) {
      return
    }

    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    textarea.focus()
    const contentLength = textarea.value.length
    textarea.setSelectionRange(contentLength, contentLength)
  }, [focusSignal])

  useEffect(() => {
    const cancelEditing = onCancelEdit
    if (!isInline || !isEditing || !cancelEditing) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const container = containerRef.current
      if (!container) {
        return
      }

      if (event.target instanceof Node && !container.contains(event.target)) {
        if (event.target instanceof Element && event.target.closest('[data-floating-menu-root="true"]')) {
          return
        }

        cancelEditing?.()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isInline, isEditing, onCancelEdit])

  return (
    <div ref={containerRef} className="w-full">
      <div className={`${chatInputSurfaceClassName} ${isInline ? 'px-4 py-3' : 'p-4'}`}>
        {isEditing && !isInline ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-action/25 bg-action/10 px-3 py-2 text-xs text-foreground">
            <span>Editing message</span>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={CHAT_ATTACHMENT_INPUT_ACCEPT}
          onChange={handleFileInputChange}
          className="hidden"
          tabIndex={-1}
        />

        {attachments.length > 0 ? (
          <div className="mb-3">
            <AttachmentPillList attachments={attachments} onRemoveAttachment={handleRemoveAttachment} />
          </div>
        ) : null}

        <div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onInput={handleInput}
            placeholder={isEditing ? 'Edit your message...' : 'Type a message...'}
            disabled={disabled}
            rows={1}
            className="min-h-[28px] max-h-[150px] w-full resize-none border-none bg-transparent text-[15px] leading-6 text-foreground outline-none placeholder:text-subtle-foreground focus:outline-none focus:ring-0"
            style={{ fieldSizing: 'content' } as CSSProperties}
          />
        </div>

        {attachmentError ? <p className="mt-2 text-sm text-danger-foreground">{attachmentError}</p> : null}

        <div className="mt-3 flex items-end justify-between gap-3">
          {showRuntimeControls ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:flex-nowrap">
              {canManageAttachments ? (
                <Tooltip content="Attach files">
                  <button
                    type="button"
                    onClick={handleManualAttachClick}
                    disabled={disabled}
                    aria-label="Attach files"
                    className="group flex h-8 w-8 items-center justify-center bg-transparent text-foreground disabled:cursor-not-allowed disabled:text-disabled-foreground"
                  >
                    <Paperclip size={14} className="shrink-0 transition-colors duration-150 group-hover:text-foreground" />
                  </button>
                </Tooltip>
              ) : null}

              {showChatModeSelector ? (
                <ChatModeSelectorField
                  value={selectedChatMode}
                  onChange={onChatModeChange ?? (() => undefined)}
                  options={chatModeOptions}
                  disabled={chatModeSelectorDisabled}
                />
              ) : null}

              {showModelSelector ? (
                <ModelSelectorField
                  value={selectedModelId}
                  onChange={onModelChange ?? (() => undefined)}
                  options={modelOptions}
                  disabled={disabled}
                />
              ) : null}

              {showReasoningControl ? (
                <ReasoningEffortBlock
                  options={reasoningEffortOptions}
                  value={reasoningEffort}
                  onChange={onReasoningEffortChange}
                  disabled={disabled}
                />
              ) : null}
            </div>
          ) : null}

          <div className="flex shrink-0 justify-end self-end">
            <Tooltip content={canAbort ? 'Stop generating' : isEditing ? 'Send edited message' : 'Send message'}>
              <button
                type="button"
                onClick={canAbort ? handleAbort : handleSend}
                disabled={canAbort ? false : !canSend}
                aria-label={canAbort ? 'Stop generating' : isEditing ? 'Send edited message' : 'Send message'}
                className={[
                  'flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150',
                  canAbort || canSend
                    ? 'chat-send-button-enabled cursor-pointer hover:scale-[1.03] active:scale-95'
                    : 'chat-send-button-disabled cursor-not-allowed',
                ].join(' ')}
              >
                {canAbort ? <Square size={14} strokeWidth={2.5} fill="currentColor" /> : <ArrowUp size={16} strokeWidth={2.5} />}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
}
