import { useQuery } from "@tanstack/react-query";
import { dashboardKeys } from "@/lib/queryKeys";
import { getActivityFeed, getDailyActivity, getLastPayments } from "./api";

// S-20 contract: every query carries a businessId. The chart's window
// length is part of its key — switching 7/30/90 re-reads, and each
// window keeps its own cache.

export function useDailyActivity(businessId: string, days: number) {
  return useQuery({
    queryKey: dashboardKeys.daily(businessId, days),
    queryFn: () => getDailyActivity(businessId, days),
  });
}

export function useActivityFeed(businessId: string) {
  return useQuery({
    queryKey: dashboardKeys.feed(businessId),
    queryFn: () => getActivityFeed(businessId),
  });
}

export function useLastPayments(businessId: string, ids: string[]) {
  return useQuery({
    queryKey: dashboardKeys.lastPayments(businessId, ids),
    queryFn: () => getLastPayments(ids),
    enabled: ids.length > 0,
  });
}
