import { cn } from "@/lib/utils";

const palette = [
  "bg-receivable/15 text-receivable",
  "bg-credit/15 text-credit",
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
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
  const colorClass = palette[hashString(name) % palette.length]!;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
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
