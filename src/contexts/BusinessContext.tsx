import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberships } from "@/features/business/hooks";
import { BusinessBootSkeleton } from "@/features/business/components/BusinessBootSkeleton";
import type { BusinessRole, BusinessSummary } from "@/features/business/api";
import { toAppError, type AppError } from "@/lib/AppError";

export type BusinessStatus = "loading" | "ready" | "none" | "forbidden";

export interface BusinessContextValue {
  status: BusinessStatus;
  business: BusinessSummary | null;
  role: BusinessRole | null;
  isOwner: boolean;
  /** Transitional (until S-20): null for a healthy "none". */
  error: AppError | null;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const memberships = useMemberships({ enabled: !!session });

  // Clean sign-out (S-14): nothing from the previous session survives.
  // At first mount the session is still resolving, so this clears an
  // empty cache — harmless.
  useEffect(() => {
    if (!session) queryClient.clear();
  }, [session, queryClient]);

  const value = useMemo<BusinessContextValue>(() => {
    const none = (error: AppError | null = null): BusinessContextValue => ({
      status: "none",
      business: null,
      role: null,
      isOwner: false,
      error,
    });

    // Signed out: settle immediately so the login page never waits.
    if (!session) return none();

    if (memberships.isPending) {
      return {
        status: "loading",
        business: null,
        role: null,
        isOwner: false,
        error: null,
      };
    }

    if (memberships.isError) {
      const error = toAppError(memberships.error);
      // Permission loss becomes "forbidden" (surfaced properly in S-27).
      if (error.code === "forbidden") {
        return { ...none(error), status: "forbidden" };
      }
      // Transitional: any other failure (e.g. migrations not yet applied
      // at first deploy) behaves like v1 — status "none", data unscoped.
      return none(error);
    }

    // Transitional until S-17 routes exist: the active business is the
    // user's own business, or none. Member-only users land on none and
    // get their invitation flow in S-24.
    const own =
      memberships.data.businesses.find((b) => b.isOwner) ?? null;
    if (!own) return none();

    return {
      status: "ready",
      business: own,
      role: own.role,
      isOwner: true,
      error: null,
    };
  }, [session, memberships]);

  // No flash of wrong content: a signed-in user waits on one skeleton
  // before any page mounts.
  if (session && value.status === "loading") {
    return <BusinessBootSkeleton />;
  }

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusinessContext(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) {
    throw new Error(
      "useBusinessContext must be used within a BusinessProvider",
    );
  }
  return ctx;
}

export function useActiveBusiness(): {
  business: BusinessSummary | null;
  role: BusinessRole | null;
  isOwner: boolean;
  status: BusinessStatus;
} {
  const { business, role, isOwner, status } = useBusinessContext();
  return { business, role, isOwner, status };
}
