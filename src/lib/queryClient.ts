import {
  MutationCache,
  QueryCache,
  QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toAppError } from "@/lib/AppError";
import { businessKeys } from "@/lib/queryKeys";

/**
 * S-27: any forbidden error anywhere means my access may have just
 * changed — the role may have been downgraded or the membership
 * removed. The memberships query is the single source of truth for
 * both, so every refusal refetches it and the guard, switcher and
 * permission gates settle on fresh truth.
 *
 * The memberships query itself is excluded: refetching it in reaction
 * to its own forbidden error would loop.
 */
function refetchMembershipsOnForbidden(
  client: QueryClient,
  error: unknown,
  queryKey?: QueryKey,
): void {
  if (toAppError(error).code !== "forbidden") return;
  if (queryKey && queryKey[0] === businessKeys.memberships()[0]) return;
  void client.invalidateQueries({ queryKey: businessKeys.memberships() });
}

/**
 * One factory so the app and the test harness share the real client
 * configuration (the S-27 forbidden-refetch wiring included).
 */
export function createAppQueryClient(): QueryClient {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        refetchMembershipsOnForbidden(client, error, query.queryKey);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        refetchMembershipsOnForbidden(client, error);
      },
    }),
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
  return client;
}

export const queryClient = createAppQueryClient();
