import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  BusinessProvider,
  useActiveBusiness,
  useBusinessContext,
} from "@/contexts/BusinessContext";
import { businessKeys } from "@/lib/queryKeys";
import { AppError } from "@/lib/AppError";
import type { Memberships } from "@/features/business/api";

const authState = vi.hoisted(() => ({ session: null as Session | null }));
const membershipState = vi.hoisted(() => ({
  impl: null as null | (() => Promise<Memberships>),
  calls: 0,
}));

vi.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    session: authState.session,
    user: authState.session?.user ?? null,
    loading: false,
    signInWithGoogle: async () => {},
    signOut: async () => {},
  }),
}));

vi.mock("@/features/business/api", () => ({
  getMemberships: () => {
    membershipState.calls += 1;
    if (!membershipState.impl) throw new Error("membershipState.impl unset");
    return membershipState.impl();
  },
}));

const session = {
  user: { id: "u1", email: "asha@example.com" },
} as unknown as Session;

const readyMemberships: Memberships = {
  businesses: [
    {
      id: "b1",
      name: "Bahi Khata",
      businessType: "general",
      ownerId: "u1",
      ownerName: "Asha Verma",
      ownerEmail: "asha@example.com",
      role: "owner",
      isOwner: true,
    },
    {
      id: "b2",
      name: "Rahim Traders",
      businessType: "general",
      ownerId: "u2",
      ownerName: "Rahim Ali",
      ownerEmail: "rahim@example.com",
      role: "viewer",
      isOwner: false,
    },
  ],
  invitations: [
    {
      id: "i1",
      businessId: "b3",
      businessName: "City Mart",
      role: "editor",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
};

const memberOnlyMemberships: Memberships = {
  businesses: [readyMemberships.businesses[1]!],
  invitations: [],
};

function Probe() {
  const active = useActiveBusiness();
  const { error } = useBusinessContext();
  return (
    <div>
      <span data-testid="status">{active.status}</span>
      <span data-testid="business">{active.business?.name ?? "none"}</span>
      <span data-testid="role">{active.role ?? "none"}</span>
      <span data-testid="isOwner">{String(active.isOwner)}</span>
      <span data-testid="error">{error?.code ?? "none"}</span>
    </div>
  );
}

// A fresh element tree each call — React bails out of re-rendering when
// handed the identical element reference, which would hide session flips.
function makeTree(queryClient: QueryClient, probes = 1) {
  return (
    <QueryClientProvider client={queryClient}>
      <BusinessProvider>
        {Array.from({ length: probes }, (_, i) => (
          <Probe key={i} />
        ))}
      </BusinessProvider>
    </QueryClientProvider>
  );
}

function renderProvider(probes = 1) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(makeTree(queryClient, probes));
  return {
    queryClient,
    rerenderTree: () => utils.rerender(makeTree(queryClient, probes)),
    ...utils,
  };
}

function first(status: string) {
  return () => {
    expect(screen.getAllByTestId("status")[0]?.textContent).toBe(status);
  };
}

beforeEach(() => {
  authState.session = null;
  membershipState.impl = null;
  membershipState.calls = 0;
});

describe("S-14 business resolution provider", () => {
  it("loads memberships exactly once for any number of consumers", async () => {
    authState.session = session;
    membershipState.impl = async () => readyMemberships;

    const { queryClient } = renderProvider(2);

    // Two consumers later, both see the same resolved value…
    await waitFor(() => {
      expect(screen.getAllByTestId("status")).toHaveLength(2);
      screen
        .getAllByTestId("status")
        .forEach((el) => expect(el.textContent).toBe("ready"));
    });

    // …and the query ran a single time.
    expect(membershipState.calls).toBe(1);

    // business, role, isOwner from useActiveBusiness()
    expect(screen.getAllByTestId("business")[0]?.textContent).toBe(
      "Bahi Khata",
    );
    expect(screen.getAllByTestId("role")[0]?.textContent).toBe("owner");
    expect(screen.getAllByTestId("isOwner")[0]?.textContent).toBe("true");

    // pending invitations ride along in the same cache entry
    const cached = queryClient.getQueryData(businessKeys.memberships()) as
      | Memberships
      | undefined;
    expect(cached?.invitations).toHaveLength(1);
    expect(cached?.invitations[0]?.businessName).toBe("City Mart");
  });

  it("shows the boot skeleton while loading and mounts nothing else", async () => {
    authState.session = session;
    let resolve!: (m: Memberships) => void;
    membershipState.impl = () =>
      new Promise((r) => {
        resolve = r;
      });

    const { getByTestId } = renderProvider();

    // No business data, no content — only the skeleton.
    expect(screen.queryByTestId("status")).toBeNull();
    expect(
      screen.getByRole("status", { name: "Loading your businesses" }),
    ).toBeTruthy();

    await act(async () => {
      resolve({ businesses: [], invitations: [] });
    });

    await waitFor(first("none"));
    expect(
      screen.queryByRole("status", { name: "Loading your businesses" }),
    ).toBeNull();
    expect(getByTestId("business").textContent).toBe("none");
  });

  it("makes the active business the user's own, or none", async () => {
    authState.session = session;
    membershipState.impl = async () => memberOnlyMemberships;

    renderProvider();

    await waitFor(first("none"));
    expect(screen.getByTestId("business").textContent).toBe("none");
    expect(screen.getByTestId("isOwner").textContent).toBe("false");
    expect(screen.getByTestId("error").textContent).toBe("none");
  });

  it("maps permission errors to forbidden", async () => {
    authState.session = session;
    membershipState.impl = async () => {
      throw new AppError(
        "forbidden",
        "You do not have permission to do this.",
      );
    };

    renderProvider();
    await waitFor(first("forbidden"));
    expect(screen.getByTestId("error").textContent).toBe("forbidden");
  });

  it("treats non-permission failures as none (v1 unscoped behavior)", async () => {
    authState.session = session;
    membershipState.impl = async () => {
      throw new AppError(
        "network",
        "Network error. Check your connection and try again.",
      );
    };

    renderProvider();
    await waitFor(first("none"));
    expect(screen.getByTestId("error").textContent).toBe("network");
  });

  it("renders signed-out users immediately, without a skeleton", () => {
    authState.session = null;
    membershipState.impl = async () => readyMemberships;

    renderProvider();

    expect(screen.getByTestId("status").textContent).toBe("none");
    expect(
      screen.queryByRole("status", { name: "Loading your businesses" }),
    ).toBeNull();
    expect(membershipState.calls).toBe(0);
  });

  it("clears the query cache on sign-out", async () => {
    authState.session = session;
    membershipState.impl = async () => readyMemberships;

    const { queryClient, rerenderTree } = renderProvider();
    await waitFor(first("ready"));

    // Simulate cached business data from the session.
    queryClient.setQueryData(["customers"], [{ id: "c1" }]);
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(1);

    // Sign out: the session flips to null, then the app re-renders.
    authState.session = null;
    rerenderTree();

    await waitFor(() =>
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0),
    );
    expect(screen.getByTestId("status").textContent).toBe("none");
    expect(membershipState.calls).toBe(1);
  });
});
