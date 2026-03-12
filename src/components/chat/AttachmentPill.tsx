import { FileText, Image as ImageIcon, Paperclip, X } from 'lucide-react'
import { getChatAttachmentLabel } from '../../lib/chatAttachments'
import type { ChatAttachment } from '../../types/chat'

interface AttachmentPillProps {
  attachment: ChatAttachment
  onRemove?: () => void
}

function getAttachmentIcon(attachment: ChatAttachment) {
  if (attachment.kind === 'image') {
    return ImageIcon
  }

  if (attachment.kind === 'text') {
    return FileText
  }

  return Paperclip
}

export function AttachmentPill({ attachment, onRemove }: AttachmentPillProps) {
  const Icon = getAttachmentIcon(attachment)

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-accent-soft px-3 py-1.5 text-sm text-accent-foreground">
      <Icon size={14} className="shrink-0" />
      <span className="min-w-0 truncate">{getChatAttachmentLabel(attachment)}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${getChatAttachmentLabel(attachment)}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  )
}
