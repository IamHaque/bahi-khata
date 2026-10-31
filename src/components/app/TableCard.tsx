import * as React from "react";
import { cn } from "@/lib/utils";

export interface TableCardSpec {
  lead?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  lines?: React.ReactNode[];
  actions?: React.ReactNode;
}

export interface TableCardProps {
  card: TableCardSpec;
  onClick?: () => void;
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
  canSelect?: boolean;
  className?: string;
}

export function TableCard({
  card,
  onClick,
  selected = false,
  onSelectChange,
  canSelect = false,
  className,
}: TableCardProps) {
  const { lead, title, subtitle, meta, trailing, lines, actions } = card;

  return (
    <div
      className={cn(
        "relative rounded-lg border border-border bg-card p-3 transition-colors",
        onClick && "cursor-pointer hover:bg-muted/30",
        selected && "border-primary bg-primary/5",
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {canSelect && onSelectChange && (
          <div
            className="flex items-center pt-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelectChange(e.target.checked)}
              className="size-4 rounded border-input text-primary focus:ring-ring"
            />
          </div>
        )}

        {lead && <div className="shrink-0">{lead}</div>}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 font-medium text-foreground">
              {title}
            </div>
            {trailing && (
              <div className="shrink-0 text-right font-heading tabular-nums">
                {trailing}
              </div>
            )}
          </div>

          {(subtitle || meta) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {subtitle && <span>{subtitle}</span>}
              {meta && <span>{meta}</span>}
            </div>
          )}

          {lines && lines.length > 0 && (
            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>

        {actions && (
          <div className="shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
