import { useState } from "react";
import { cn } from "@/lib/utils";

const palette = [
  "bg-receivable/10 dark:bg-receivable/8 text-receivable",
  "bg-credit/10 dark:bg-credit/8 text-credit",
  "bg-primary/10 dark:bg-primary/8 text-primary",
  "bg-success/10 dark:bg-success/8 text-success",
  "bg-warning/10 dark:bg-warning/8 text-warning",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md";
  className?: string;
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const colorClass = palette[hashString(name) % palette.length]!;

  // L-03: a URL that fails to load falls through to the initials, so a
  // broken photo never renders as a black circle.
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        className={cn(
          "shrink-0 rounded-full object-cover",
          size === "sm" ? "h-7 w-7" : "h-9 w-9",
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm",
        colorClass,
        className,
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
