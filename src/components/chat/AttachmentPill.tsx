import { X } from 'lucide-react'
import { resolveFileIconConfig } from '../../lib/fileIconResolver'
import { getChatAttachmentLabel } from '../../lib/chatAttachments'
import type { ChatAttachment } from '../../types/chat'

interface AttachmentPillProps {
  attachment: ChatAttachment
  onRemove?: () => void
}

export function AttachmentPill({ attachment, onRemove }: AttachmentPillProps) {
  const isRemovable = typeof onRemove === 'function'
  const attachmentLabel = getChatAttachmentLabel(attachment)
  const iconConfig = resolveFileIconConfig({
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
  })
  const Icon = iconConfig.icon
  const iconLabel = iconConfig.label

  if (!isRemovable) {
    return (
      <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-[var(--dropdown-control-surface)] px-3 py-1.5 text-sm text-muted-foreground">
        {attachment.kind === 'image' ? (
          <span className="flex h-4 w-4 shrink-0 overflow-hidden rounded-sm">
            <img src={attachment.dataUrl} alt="" className="h-full w-full object-cover" />
          </span>
        ) : (
          <Icon size={14} className="shrink-0" style={{ color: iconConfig.color }} aria-hidden="true" />
        )}
        <span className="min-w-0 truncate">{attachmentLabel}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Detach ${attachmentLabel}`}
      title={`Detach ${attachmentLabel}`}
      className="group relative inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-[var(--dropdown-control-surface)] px-3 py-1.5 text-left text-sm text-muted-foreground transition-all duration-150 hover:border-[var(--dropdown-control-hover-border)] hover:bg-[var(--dropdown-control-hover-surface)] hover:text-foreground"
    >
      {attachment.kind === 'image' ? (
        <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden rounded-xl border border-border bg-surface p-1.5 shadow-sm group-hover:block">
          <img src={attachment.dataUrl} alt={attachmentLabel} className="block max-h-48 max-w-72 rounded-lg" />
        </span>
      ) : null}

      <span
        aria-hidden="true"
        className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface/80 text-muted-foreground"
      >
        {attachment.kind === 'image' ? (
          <img
            src={attachment.dataUrl}
            alt=""
            className="h-4 w-4 rounded-[3px] object-cover transition-all duration-150 group-hover:scale-75 group-hover:opacity-0"
          />
        ) : (
          <Icon
            size={13}
            className="transition-all duration-150 group-hover:scale-75 group-hover:opacity-0"
            style={{ color: iconConfig.color }}
          />
        )}
        <X size={13} className="absolute scale-75 opacity-0 transition-all duration-150 group-hover:scale-100 group-hover:opacity-100" />
      </span>
      <span className="min-w-0 truncate">{attachmentLabel}</span>
      <span className="sr-only">Click to detach</span>
      <span className="sr-only">{iconLabel}</span>
    </button>
  )
}
