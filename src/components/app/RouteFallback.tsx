import { Skeleton } from "@/components/app/Skeleton";

/**
 * S-48 - what the router shows while a route's chunk loads. Two Skeleton
 * blocks from the existing component; the live region announces the wait
 * to screen readers.
 */
export function RouteFallback() {
  return (
    <div role="status" aria-live="polite" className="p-6">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-4 h-32 w-full" />
    </div>
  );
}
