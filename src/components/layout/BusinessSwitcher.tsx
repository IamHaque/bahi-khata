import { Building2 } from "lucide-react";

interface BusinessSwitcherProps {
  collapsed?: boolean;
}

export function BusinessSwitcher({ collapsed }: BusinessSwitcherProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="size-4" />
      </span>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            BahiKhata
          </p>
          <p className="text-xs text-muted-foreground">Business</p>
        </div>
      )}
    </div>
  );
}
