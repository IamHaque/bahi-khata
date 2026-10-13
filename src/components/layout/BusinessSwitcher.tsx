import { Building2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { useMemberships } from "@/features/business/hooks";

interface BusinessSwitcherProps {
  collapsed?: boolean;
}

/**
 * Shows the current business's name (S-18): the business in the URL,
 * falling back to the app name while memberships are unavailable (for
 * example before the migrations are applied). The full switcher —
 * switching between businesses — ships in S-26.
 */
export function BusinessSwitcher({ collapsed }: BusinessSwitcherProps) {
  const { businessId } = useParams();
  const { data: memberships } = useMemberships();
  const name = memberships?.businesses.find((b) => b.id === businessId)?.name;

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="size-4" />
      </span>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {name ?? "BahiKhata"}
          </p>
          <p className="text-xs text-muted-foreground">Business</p>
        </div>
      )}
    </div>
  );
}
