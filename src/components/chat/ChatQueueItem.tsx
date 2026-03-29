import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type RefObject } from 'react'
import { Check, Paperclip, Play, X } from 'lucide-react'
import { CHAT_ATTACHMENT_INPUT_ACCEPT, readChatAttachmentsFromFiles } from '../../lib/chatAttachmentFiles'
import { chatInputSurfaceClassName } from '../../lib/chatStyles'
import { AttachmentPillList } from './AttachmentPillList'
import type { ChatAttachment, QueuedMessage } from '../../types/chat'
import { ChatMentionText } from './ChatMentionText'
import { ChatMentionTextarea } from './ChatMentionTextarea'

interface ChatQueueItemProps {
  index: number
  message: QueuedMessage
  editCancelBoundaryRef?: RefObject<HTMLElement>
  onForceSend: (id: string) => void
  onRemove: (id: string) => void
  onUpdate: (id: string, content: string, attachments?: ChatAttachment[]) => void
}

export function ChatQueueItem({
  index,
  message,
  editCancelBoundaryRef,
  onForceSend,
  onRemove,
  onUpdate,
}: ChatQueueItemProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draftContent, setDraftContent] = useState(message.content)
  const [draftAttachments, setDraftAttachments] = useState<ChatAttachment[]>(message.attachments ?? [])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  useEffect(() => {
    setDraftContent(message.content)
    setDraftAttachments(message.attachments ?? [])
    setAttachmentError(null)
  }, [message.attachments, message.content])

  useEffect(() => {
    if (!isEditing) {
      return
    }

    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    const nextSelectionStart = textarea.value.length
    const frameId = window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(nextSelectionStart, nextSelectionStart)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [isEditing])

  function handleActivate() {
    setIsEditing(true)
  }

  function handleCancel() {
    setDraftContent(message.content)
    setDraftAttachments(message.attachments ?? [])
    setAttachmentError(null)
    setIsEditing(false)
  }

  async function handleAttachmentsChange(files: readonly File[]) {
    if (files.length === 0) {
      return
    }

    const result = await readChatAttachmentsFromFiles(files, draftAttachments.length)
    if (result.attachments.length > 0) {
      setDraftAttachments((currentValue) => [...currentValue, ...result.attachments])
    }

    setAttachmentError(result.errors[0] ?? null)
  }

  function handleSave() {
    onUpdate(message.id, draftContent, draftAttachments)
    setIsEditing(false)
  }

  function handleRemoveAttachment(attachmentId: string) {
    setDraftAttachments((currentValue) => currentValue.filter((attachment) => attachment.id !== attachmentId))
    setAttachmentError(null)
  }

  useEffect(() => {
    if (!isEditing) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const editor = editorRef.current
      const cancelBoundary = editCancelBoundaryRef?.current
      if (
        !editor ||
        !(event.target instanceof Node) ||
        editor.contains(event.target) ||
        !cancelBoundary ||
        !cancelBoundary.contains(event.target)
      ) {
        return
      }

      handleCancel()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [editCancelBoundaryRef, isEditing, message.attachments, message.content])

  if (isEditing) {
    return (
      <div className="px-2 py-2">
        <div ref={editorRef} className={`${chatInputSurfaceClassName} p-3`}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={CHAT_ATTACHMENT_INPUT_ACCEPT}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ''
              void handleAttachmentsChange(files)
            }}
            className="hidden"
            tabIndex={-1}
          />

          {draftAttachments.length > 0 ? (
            <div className="mb-3">
              <AttachmentPillList attachments={draftAttachments} onRemoveAttachment={handleRemoveAttachment} />
            </div>
          ) : null}

          <ChatMentionTextarea
            textareaRef={textareaRef}
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            onKeyDown={() => undefined}
            placeholder="Edit queued message"
            rows={1}
            style={{ fieldSizing: 'content' } as CSSProperties}
          />

          {attachmentError ? <p className="mt-2 text-sm text-danger-foreground">{attachmentError}</p> : null}

          <div className="mt-1 flex items-end justify-between gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group flex h-8 w-8 items-center justify-center bg-transparent text-foreground disabled:cursor-not-allowed disabled:text-disabled-foreground"
              aria-label="Attach files"
              title="Attach files"
            >
              <Paperclip size={14} className="shrink-0 transition-colors duration-150 group-hover:text-foreground" />
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={draftContent.trim().length === 0 && draftAttachments.length === 0}
              aria-label="Save queued message"
              title="Save queued message"
              className={[
                'flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150',
                draftContent.trim().length > 0 || draftAttachments.length > 0
                  ? 'chat-send-button-enabled cursor-pointer hover:scale-[1.03] active:scale-95'
                  : 'chat-send-button-disabled cursor-not-allowed',
              ].join(' ')}
            >
              <Check size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const attachmentCount = message.attachments?.length ?? 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleActivate()
        }
      }}
      className="group flex cursor-pointer items-center justify-between gap-2 px-2 py-2 text-left transition-[background-color,color,box-shadow] hover:bg-surface-muted/70"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-[11px] font-semibold text-foreground"
          aria-hidden="true"
        >
          {index + 1}
        </div>

        <div className="min-w-0 flex-1">
          <ChatMentionText text={message.content} variant="rendered" className="truncate text-sm leading-5 text-foreground" />
          {attachmentCount > 0 ? (
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onForceSend(message.id)
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
          aria-label="Send queued message now"
          title="Send queued message now"
        >
          <Play size={14} />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onRemove(message.id)
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
          aria-label="Remove queued message"
          title="Remove queued message"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
