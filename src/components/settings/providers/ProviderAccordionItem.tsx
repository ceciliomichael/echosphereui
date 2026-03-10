import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { getStatusPillClassName, type StatusPillTone } from '../shared/statusPillStyles'

interface ProviderAccordionItemProps {
  actions: ReactNode
  children: ReactNode
  description: string
  isExpanded: boolean
  isFirst?: boolean
  statusLabel: string
  statusTone: StatusPillTone
  title: string
  onToggle: () => void
}

export function ProviderAccordionItem({
  actions,
  children,
  description,
  isExpanded,
  isFirst = false,
  statusLabel,
  statusTone,
  title,
  onToggle,
}: ProviderAccordionItemProps) {
  return (
    <section className={['bg-surface', isFirst ? '' : 'border-t border-border'].join(' ')}>
      <div className="flex flex-col gap-3 px-4 py-3.5 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            onClick={onToggle}
            className="min-w-0 flex-1 text-left"
            aria-expanded={isExpanded}
          >
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{title}</p>
              <span className={getStatusPillClassName(statusTone)}>
                {statusLabel}
              </span>
              <ChevronDown
                size={16}
                strokeWidth={2.2}
                className={[
                  'shrink-0 text-muted-foreground transition-transform duration-150',
                  isExpanded ? 'rotate-180' : '',
                ].join(' ')}
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </button>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
        </div>
      </div>

      <div
        className={[
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        ].join(' ')}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-4 py-4 md:px-5">{children}</div>
        </div>
      </div>
    </section>
  )
}
