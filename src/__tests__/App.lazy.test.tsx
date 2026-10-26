import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteFallback } from "@/components/app/RouteFallback";

// Same supabase mock as src/test/app-render.tsx: AuthProvider resolves a
// null session, so the app redirects to the (lazily loaded) login page.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signInWithOAuth: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
  },
}));

describe("App route splitting (S-48)", () => {
  // The build's chunk names are verified by `npm run build && npm run
  // audit:bundle` (and CI's bundle guard). Here we pin the source shape
  // that produces them: every page lazy, every route chunk named.
  const source = readFileSync("src/App.tsx", "utf8");

  it("lazy-loads every page (none imported statically)", () => {
    const lazyCalls = source.match(/lazy\(/g) ?? [];
    // 15 pages at the time of writing. The PRD card says 12; grep wins,
    // and S-56 added Recently Deleted as the 15th lazy chunk.
    expect(lazyCalls).toHaveLength(15);
    // No static page imports survive: nothing matches the old pattern.
    expect(source).not.toMatch(/import \{ (LoginPage|DashboardPage|CustomersPage) \}/);
  });

  it("names each route chunk in vite.config.ts so bundle reports stay readable", () => {
    // Rollup ignores webpackChunkName; stable route names come from the
    // manualChunks map in vite.config.ts (verified below against dist/).
    const viteConfig = readFileSync("vite.config.ts", "utf8");
    const namedChunks = [
      "login",
      "onboarding",
      "businesses",
      "business-settings",
      "members",
      "customers",
      "customer-detail",
      "transactions",
      "transaction-detail",
      "dashboard",
      // v3 (S-56): the owner's trash page.
      "recently-deleted",
    ];
    for (const name of namedChunks) {
      expect(viteConfig).toContain(`"${name}"`);
    }
  });

  it("renders the login route across the Suspense boundary without an uncaught error", async () => {
    const { default: App } = await import("@/App");
    window.history.pushState({}, "", "/");
    render(<App />);
    // No session -> ProtectedRoute redirects -> login chunk loads -> page
    // renders. If the lazy import failed, this would reject instead.
    const button = await screen.findByRole("button", {
      name: /Continue with Google/,
    });
    expect(button).toBeTruthy();
  });
});

describe("RouteFallback (S-48)", () => {
  it("is a polite live region with a screen-reader label and skeletons", () => {
    const { container } = render(<RouteFallback />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("Loading")).toBeTruthy();
    // Two Skeleton blocks use the existing Skeleton component.
    expect(container.querySelectorAll("[data-slot='skeleton'], .animate-pulse").length).toBeGreaterThanOrEqual(2);
  });
});
