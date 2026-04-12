import { Archive, ChevronDown, ChevronUp } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { parseCampMemoryPacket, type CampSection } from "../../lib/chatCompression";

interface CompressedHistoryMessageProps {
  summary: string;
}

function CompressedHistorySection({
  section,
}: {
  section: CampSection;
}) {
  return (
    <section className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle-foreground">
        {section.name}
      </div>
      <MarkdownRenderer
        content={section.content}
        className="w-full text-[15px] leading-6 text-foreground"
      />
    </section>
  );
}

const CompressedHistoryBody = memo(function CompressedHistoryBody({
  summary,
}: CompressedHistoryMessageProps) {
  const parsedPacket = useMemo(() => parseCampMemoryPacket(summary), [summary]);

  if (!parsedPacket) {
    return <MarkdownRenderer content={summary} className="w-full text-[15px]" />;
  }

  return (
    <div className="w-full space-y-5">
      {parsedPacket.sections.map((section, index) => (
        <div key={section.name} className={index === 0 ? "" : "border-t border-border pt-4"}>
          <CompressedHistorySection section={section} />
        </div>
      ))}
    </div>
  );
});

export function CompressedHistoryMessage({
  summary,
}: CompressedHistoryMessageProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <button
          type="button"
          onClick={() => setIsOpen((currentValue) => !currentValue)}
          className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted/50"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
              <Archive
                size={16}
                className="absolute inset-0 transition-opacity duration-150 group-hover:opacity-0"
              />
              {isOpen ? (
                <ChevronUp
                  size={16}
                  className="absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                />
              ) : (
                <ChevronDown
                  size={16}
                  className="absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                />
              )}
            </span>
            <span className="truncate text-sm font-medium text-foreground">
              Compressed context
            </span>
          </div>
        </button>

        {isOpen ? (
          <div className="border-t border-border px-4 py-4">
            <CompressedHistoryBody summary={summary} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
