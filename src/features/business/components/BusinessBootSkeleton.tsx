import { Skeleton, SkeletonRows } from "@/components/app/Skeleton";

/**
 * Full-screen shell skeleton shown while memberships load (S-14):
 * no page (and no business data from a previous session) mounts first.
 */
export function BusinessBootSkeleton() {
  return (
    <div
      className="flex min-h-screen bg-background"
      role="status"
      aria-label="Loading your businesses"
    >
      {/* Sidebar rail */}
      <div className="hidden w-60 shrink-0 border-r border-border bg-card p-4 lg:block">
        <Skeleton className="h-8 w-36" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <Skeleton className="h-5 w-40" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
        {/* Content */}
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-8">
          <Skeleton className="h-7 w-48" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <SkeletonRows count={5} />
        </main>
      </div>
    </div>
  );
}
