import { useState, useRef, useEffect } from 'react';
import { Loader2, Archive, X } from 'lucide-react';
import type { ChatMode } from '../../types/chat-mode';

interface DashedProgressCircleProps {
  percent: number;
  color: string;
  size?: number;
  isSpinning?: boolean;
}

/**
 * Custom dashed circle progress indicator
 * Shows progress by coloring individual dashes based on percentage
 */
function DashedProgressCircle({ percent, color, size = 16, isSpinning = false }: DashedProgressCircleProps) {
  const strokeWidth = 1.5;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // 8 dashes around the circle
  const dashCount = 8;
  const anglePerDash = 360 / dashCount;
  const dashArcAngle = anglePerDash * 0.6; // 60% of segment is dash

  // Generate dash arcs
  const dashes = [];
  for (let i = 0; i < dashCount; i++) {
    const startAngle = i * anglePerDash - 90; // Start from top
    const endAngle = startAngle + dashArcAngle;

    // Calculate if this dash should be filled based on percentage
    const dashMidpoint = (i + 0.5) / dashCount * 100;
    const isFilled = isSpinning || dashMidpoint <= percent;

    // Convert angles to radians
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    // Calculate arc points
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    // Create arc path
    const path = `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;

    dashes.push(
      <path
        key={i}
        d={path}
        fill="none"
        stroke={isFilled ? color : 'currentColor'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={isFilled ? 1 : 0.25}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={isSpinning ? 'animate-spin' : ''}
    >
      {dashes}
    </svg>
  );
}

interface ContextUsage {
  systemPromptTokens: number;
  historyTokens: number;
  compressedHistoryTokens: number;
  toolResultsTokens: number;
  totalTokens: number;
  maxTokens: number;
}

interface ContextIndicatorProps {
  usage: ContextUsage;
  disabled?: boolean;
  mode?: ChatMode;
  onCompress?: () => void;
  onCancelCompress?: () => void;
  isCompressing?: boolean;
  disableCompress?: boolean;
  isStreaming?: boolean;
}

/**
 * Get color based on mode and context usage percentage
 */
function getUsageColor(percent: number, mode?: ChatMode): string {
  if (mode === 'agent') {
    return '#22c55e';
  }
  if (mode === 'ask') {
    return '#3b82f6';
  }
  if (mode === 'plan') {
    return '#f97316';
  }
  if (mode === 'general') {
    return '#a855f7';
  }
  if (mode === 'review') {
    return '#ef4444';
  }
  if (mode === 'yolo') {
    return '#eab308';
  }
  if (mode === 'manual') {
    return '#06b6d4';
  }
  if (mode === 'chat') {
    return '#ec4899';
  }

  // Warning colors for high usage
  if (percent >= 90) {
    return '#ef4444'; // Red - critical
  } else if (percent >= 75) {
    return '#f59e0b'; // Yellow/amber - warning
  }
  return '#22c55e'; // Green - safe
}

/**
 * Format token count for display
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

export function ContextIndicator({ usage, disabled = false, mode, onCompress, onCancelCompress, isCompressing = false, disableCompress = false, isStreaming = false }: ContextIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [isTopTooltip, setIsTopTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<'above' | 'below'>('above');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  const usagePercent = usage.maxTokens > 0
    ? (usage.totalTokens / usage.maxTokens) * 100
    : 0;

  const color = getUsageColor(usagePercent, mode);
  
  // Show compress button when onCompress is available (user can compress anytime)
  const shouldShowCompress = !!onCompress;
  const isOverLimit = usage.totalTokens > usage.maxTokens;

  useEffect(() => {
    const handleTooltipHover = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setIsTopTooltip(customEvent.detail === 'context');
    };

    window.addEventListener('echode-tooltip-hover', handleTooltipHover as EventListener);

    return () => {
      window.removeEventListener('echode-tooltip-hover', handleTooltipHover as EventListener);
    };
  }, []);

  // Calculate tooltip position when showing
  const calculatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      // Show below if not enough space above (tooltip is ~200px tall)
      return spaceAbove < 220 ? 'below' : 'above';
    }
    return 'above';
  };

  const handleMouseEnter = () => {
    window.dispatchEvent(new CustomEvent('echode-tooltip-hover', { detail: 'context' }));
    window.dispatchEvent(new CustomEvent('echode-context-indicator-hover'));
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setTooltipPosition(calculatePosition());
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = window.setTimeout(() => {
      setShowTooltip(false);
    }, 50);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className="p-1 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          color,
        }}
        aria-label={`Context usage: ${usagePercent.toFixed(0)}%`}
      >
        <DashedProgressCircle percent={usagePercent} color={color} size={16} isSpinning={isCompressing} />
      </button>

      {showTooltip && (
        <div
          className={`absolute w-64 p-3 rounded-xl border shadow-lg ${tooltipPosition === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          style={{
            zIndex: isTopTooltip ? 60 : 40,
            right: 0,
            backgroundColor: 'var(--vscode-editor-background)',
            borderColor: 'var(--vscode-input-border)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--vscode-foreground)' }}
            >
              Context Usage
            </span>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${color}20`,
                color,
              }}
            >
              {usagePercent.toFixed(1)}%
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="h-2 rounded-full mb-3 overflow-hidden"
            style={{ backgroundColor: 'var(--vscode-input-border)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(usagePercent, 100)}%`,
                backgroundColor: color,
              }}
            />
          </div>

          {/* Breakdown */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
                System Prompt
              </span>
              <span style={{ color: 'var(--vscode-foreground)' }}>
                {formatTokens(usage.systemPromptTokens)}
              </span>
            </div>
            {usage.compressedHistoryTokens > 0 && (
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
                  Compressed History
                </span>
                <span style={{ color: 'var(--vscode-foreground)' }}>
                  {formatTokens(usage.compressedHistoryTokens)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
                Chat History
              </span>
              <span style={{ color: 'var(--vscode-foreground)' }}>
                {formatTokens(usage.historyTokens)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
                Tool Results
              </span>
              <span style={{ color: 'var(--vscode-foreground)' }}>
                {formatTokens(usage.toolResultsTokens)}
              </span>
            </div>
            <div
              className="border-t pt-1.5 mt-1.5 flex justify-between text-xs"
              style={{ borderColor: 'var(--vscode-input-border)' }}
            >
              <span
                className="font-medium"
                style={{ color: 'var(--vscode-foreground)' }}
              >
                Total / Max
              </span>
              <span
                className="font-medium"
                style={{ color: 'var(--vscode-foreground)' }}
              >
                {formatTokens(usage.totalTokens)} / {formatTokens(usage.maxTokens)}
              </span>
            </div>
          </div>

          {/* Compress History Button */}
          {shouldShowCompress && (
            <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: 'var(--vscode-input-border)' }}>
              {isCompressing ? (
                <div className="flex gap-2">
                  <div
                    className="flex-1 px-3 py-2.5 text-xs font-medium rounded-xl border flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: 'var(--vscode-input-background)',
                      color: 'var(--vscode-descriptionForeground)',
                      borderColor: 'var(--vscode-input-border)',
                    }}
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Compressing...</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onCancelCompress) {
                        onCancelCompress();
                      }
                    }}
                    className="px-3 py-2.5 text-xs font-medium rounded-xl border transition-all hover:opacity-80 flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
                      color: 'var(--vscode-errorForeground)',
                      borderColor: 'var(--vscode-inputValidation-errorBorder)',
                    }}
                    title="Cancel compression"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onCompress && !disableCompress && !isStreaming) {
                      onCompress();
                    }
                  }}
                  disabled={disableCompress || isStreaming}
                  className="w-full px-3 py-2.5 text-xs font-medium rounded-xl border transition-all hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                    borderColor: 'var(--vscode-button-border)',
                  }}
                  title={isStreaming ? 'AI is currently working' : (disableCompress ? 'Already a new chat session' : 'Compress chat history and start new chat')}
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Compress & New Chat</span>
                </button>
              )}
              {isOverLimit && (
                <p
                  className="text-xs mt-2 text-center"
                  style={{ color: 'var(--vscode-errorForeground)', opacity: 0.9 }}
                >
                  Context limit exceeded
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
