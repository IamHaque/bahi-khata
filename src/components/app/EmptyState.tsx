import type { ReactNode } from "react";
import { TallyMark } from "@/components/app/TallyMark";

interface EmptyStateProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function EmptyState({ title, description, children }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-border bg-card bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,var(--border)_31px,var(--border)_32px)] px-6 py-12 text-center">
      <TallyMark className="block mx-auto mb-3 size-8 text-muted-foreground" />
      <p className="text-base font-semibold font-heading">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {children && <div className="mt-4 flex justify-center gap-2">{children}</div>}
    </div>
  );
}
