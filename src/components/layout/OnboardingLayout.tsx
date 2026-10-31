import type { ReactNode } from "react";

interface OnboardingLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * Minimal centered layout for onboarding pages (S-15): no sidebar, no
 * top bar — one focused card on the page background.
 */
export function OnboardingLayout({
  title,
  description,
  children,
}: OnboardingLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-lg font-semibold tracking-tight text-foreground">
          BahiKhata
        </p>
        {/* L-14 (F4): match the flat Card rule (PRD 5.2) — rounded-lg, hairline
            border, no shadow — instead of rounded-2xl + shadow-sm. */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
