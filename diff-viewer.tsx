import { memo, useMemo } from 'react';

/**
 * Normalize content by converting escaped sequences to actual characters.
 * We ONLY do this when the content appears to be a single packed line with
 * no real newlines. This preserves intentional "\\n" inside string literals
 * in normal multi-line code.
 */
function normalizeEscapedSequences(content: string): string {
  if (!content) return content;

  const hasActualNewlines = content.includes('\n');
  const hasEscapedSequences = /\\[ntr]/.test(content);

  if (!hasActualNewlines && hasEscapedSequences) {
    return content
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r');
  }

  return content;
}

interface DiffViewerProps {
  oldContent: string | null | undefined;
  newContent: string;
  fileName?: string;
  isStreaming?: boolean;
  viewOnly?: boolean;
  startLineNumber?: number;
  endLineNumber?: number;
  contextLines?: number; // When set, show only changed sections with N lines of context
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'collapsed';
  lineNumber: number | null;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  collapsedCount?: number; // For collapsed sections
}

/**
 * Simple diff algorithm to compare two strings line by line
 */
function computeDiff(oldContent: string | null | undefined, newContent: string, isStreaming: boolean = false, startLineNumber: number = 1): DiffLine[] {
  // Normalize escaped sequences before processing
  const normalizedNewContent = normalizeEscapedSequences(newContent);
  const normalizedOldContent = oldContent ? normalizeEscapedSequences(oldContent) : oldContent;

  // If no old content, all lines are added
  if (normalizedOldContent === null || normalizedOldContent === undefined) {
    const newLines = normalizedNewContent.split('\n');
    return newLines.map((line, idx) => ({
      type: 'added' as const,
      lineNumber: idx + startLineNumber,
      newLineNumber: idx + startLineNumber,
      oldLineNumber: undefined,
      content: line,
    }));
  }

  const oldLines = normalizedOldContent.split('\n');
  const newLines = normalizedNewContent.split('\n');
  const diff: DiffLine[] = [];

  let oldIndex = 0;
  let newIndex = 0;

  // Simple line-by-line comparison
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldLines[oldIndex];
    const newLine = newLines[newIndex];

    if (oldIndex >= oldLines.length) {
      // Remaining lines are added
      diff.push({
        type: 'added',
        lineNumber: newIndex + 1,
        newLineNumber: newIndex + 1,
        oldLineNumber: undefined,
        content: newLine,
      });
      newIndex++;
    } else if (newIndex >= newLines.length) {
      // Remaining lines are removed
      // CRITICAL CHANGE: If streaming, do NOT show remaining lines as removed
      // This prevents the "red wall" effect while generating code
      if (!isStreaming) {
        diff.push({
          type: 'removed',
          lineNumber: oldIndex + 1,
          oldLineNumber: oldIndex + 1,
          newLineNumber: undefined,
          content: oldLine,
        });
      }
      oldIndex++;
    } else if (oldLine === newLine) {
      // Lines are the same
      diff.push({
        type: 'unchanged',
        lineNumber: oldIndex + 1,
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1,
        content: oldLine,
      });
      oldIndex++;
      newIndex++;
    } else {
      // Check if the new line exists further down in old content
      const foundInOld = oldLines.slice(oldIndex + 1).indexOf(newLine);
      // Check if the old line exists further down in new content
      const foundInNew = newLines.slice(newIndex + 1).indexOf(oldLine);

      if (foundInOld !== -1 && (foundInNew === -1 || foundInOld <= foundInNew)) {
        // Lines were removed
        diff.push({
          type: 'removed',
          lineNumber: oldIndex + 1,
          oldLineNumber: oldIndex + 1,
          newLineNumber: undefined,
          content: oldLine,
        });
        oldIndex++;
      } else if (foundInNew !== -1) {
        // Lines were added
        diff.push({
          type: 'added',
          lineNumber: newIndex + 1,
          newLineNumber: newIndex + 1,
          oldLineNumber: undefined,
          content: newLine,
        });
        newIndex++;
      } else {
        // Lines were changed (show as removed + added)
        diff.push({
          type: 'removed',
          lineNumber: oldIndex + 1,
          oldLineNumber: oldIndex + 1,
          newLineNumber: undefined,
          content: oldLine,
        });
        diff.push({
          type: 'added',
          lineNumber: newIndex + 1,
          newLineNumber: newIndex + 1,
          oldLineNumber: undefined,
          content: newLine,
        });
        oldIndex++;
        newIndex++;
      }
    }
  }

  return diff;
}

/**
 * Filter diff lines to show only changed sections with context
 */
function filterDiffWithContext(diffLines: DiffLine[], contextLines: number | undefined): DiffLine[] {
  if (contextLines === undefined) {
    return diffLines;
  }

  // Find indices of all changed lines
  const changedIndices = new Set<number>();
  diffLines.forEach((line, idx) => {
    if (line.type === 'added' || line.type === 'removed') {
      changedIndices.add(idx);
    }
  });

  if (changedIndices.size === 0) {
    return diffLines; // No changes, show all
  }

  // Build set of indices to include (changed lines + context)
  const includedIndices = new Set<number>();
  changedIndices.forEach((idx) => {
    for (let i = Math.max(0, idx - contextLines); i <= Math.min(diffLines.length - 1, idx + contextLines); i++) {
      includedIndices.add(i);
    }
  });

  // Build filtered result with collapsed indicators
  const result: DiffLine[] = [];
  let i = 0;

  while (i < diffLines.length) {
    if (includedIndices.has(i)) {
      result.push(diffLines[i]);
      i++;
    } else {
      // Start of collapsed section
      const collapsedStart = i;
      while (i < diffLines.length && !includedIndices.has(i)) {
        i++;
      }
      const collapsedCount = i - collapsedStart;

      // Add collapsed indicator
      result.push({
        type: 'collapsed',
        lineNumber: null,
        content: '',
        collapsedCount,
      });
    }
  }

  return result;
}

const DiffViewerComponent = ({ oldContent, newContent, fileName, isStreaming = false, viewOnly = false, startLineNumber = 1, endLineNumber, contextLines }: DiffViewerProps) => {
  const diffLines = useMemo(
    () => {
      const diff = computeDiff(oldContent, newContent, isStreaming, startLineNumber);
      return filterDiffWithContext(diff, contextLines);
    },
    [oldContent, newContent, isStreaming, startLineNumber, contextLines],
  );

  // If there are no old line numbers at all, this is effectively a "new file" diff.
  // In that case, we render a single new-side column even in diff mode.
  const hasOldSide = !viewOnly && diffLines.some((line) => line.type !== 'collapsed' && line.oldLineNumber !== undefined);

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden border border-[var(--vscode-input-border)]">
      {/* Diff Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 py-2 text-xs font-medium border-b"
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          borderColor: 'var(--vscode-input-border)',
          color: 'var(--vscode-descriptionForeground)',
        }}
      >
        <span className="truncate">{fileName}</span>
        {startLineNumber && endLineNumber && (
          <span className="ml-2 flex-shrink-0">{startLineNumber}-{endLineNumber}</span>
        )}
      </div>

      {/* Diff Content - scrollable area */}
      <div
        className="flex-1 flex flex-col text-xs font-mono overflow-auto min-h-0"
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
        }}
      >
        <div style={{ width: 'fit-content', minWidth: '100%' }}>
          {diffLines.map((line, idx) => {
            if (line.type === 'collapsed') {
              return null;
            }

            let bgColor: string;
            if (viewOnly) {
              bgColor = 'transparent';
            } else {
              switch (line.type) {
                case 'added':
                  bgColor = 'var(--vscode-diffEditor-insertedTextBackground)';
                  break;
                case 'removed':
                  bgColor = 'var(--vscode-diffEditor-removedTextBackground)';
                  break;
                default:
                  bgColor = 'transparent';
              }
            }

            return (
              <div key={idx} className="flex min-h-[1.15rem] w-full">
                {/* Line Number Cell - Sticky */}
                <div
                  className="flex-shrink-0 select-none sticky left-0 z-10 px-2 text-right leading-[1.15rem]"
                  style={{
                    minWidth: viewOnly || !hasOldSide ? '40px' : '80px',
                    backgroundColor: 'var(--vscode-editor-background)',
                    color: 'var(--vscode-editorLineNumber-foreground)',
                  }}
                >
                  {viewOnly || !hasOldSide ? (
                    <span className="inline-block w-6">{line.newLineNumber}</span>
                  ) : (
                    <>
                      <span className="inline-block w-6">
                        {line.oldLineNumber !== undefined ? line.oldLineNumber : ''}
                      </span>
                      <span className="mx-1">|</span>
                      <span className="inline-block w-6">
                        {line.newLineNumber !== undefined ? line.newLineNumber : ''}
                      </span>
                    </>
                  )}
                </div>

                {/* Code Content Cell */}
                <pre
                  className="flex-1 px-2 whitespace-pre m-0 leading-[1.15rem] overflow-visible"
                  style={{
                    color: 'var(--vscode-editor-foreground)',
                    backgroundColor: bgColor,
                  }}
                >
                  {line.content || ' '}
                </pre>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const DiffViewer = memo(DiffViewerComponent);
