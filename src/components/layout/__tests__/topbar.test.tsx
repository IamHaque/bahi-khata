import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { Topbar } from "@/components/layout/Topbar";
import { paths, routePatterns } from "@/lib/paths";

const businessApi = vi.hoisted(() => ({ getMemberships: vi.fn() }));
vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
}));

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

const owner = {
  businesses: [{ id: "b1", name: "Rahim Traders", role: "owner", isOwner: true }],
  invitations: [],
};
const viewer = {
  businesses: [
    { id: "b1", name: "Rahim Traders", role: "viewer", isOwner: false },
  ],
  invitations: [],
};
// A pending invitation renders a badge once memberships resolve - the
// tests wait for it to prove the permissions have landed before they
// assert anything about the Add transaction button's absence.
const ownerWithInvitation = {
  businesses: [
    { id: "b1", name: "Rahim Traders", role: "owner", isOwner: true },
  ],
  invitations: [{ id: "inv-1" }],
};

type TopbarProps = React.ComponentProps<typeof Topbar>;

function renderTopbar(props: Partial<TopbarProps> = {}) {
  return renderApp(
    <Routes>
      <Route
        path={routePatterns.business}
        element={
          <Topbar
            title="Customers"
            collapsed={false}
            onToggleSidebar={() => {}}
            onOpenMenu={() => {}}
            {...props}
          />
        }
      />
    </Routes>,
    { session, route: paths.business("b1") },
  );
}

beforeEach(() => {
  businessApi.getMemberships.mockReset();
});

describe("top bar (L-05)", () => {
  it("carries the title as a paragraph hidden from lg up, with a spacer for the right-hand controls", () => {
    businessApi.getMemberships.mockResolvedValue(owner);
    renderTopbar();

    const title = screen.getByText("Customers");
    expect(title.tagName).toBe("P");
    expect(title.className).toContain("flex-1");
    expect(title.className).toContain("lg:hidden");

    // The spacer takes over at lg so the buttons stay right-aligned.
    const spacer = document.querySelector("div.hidden.flex-1.lg\\:block");
    expect(spacer).toBeTruthy();
    expect(spacer!.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows Add transaction by default when the user may manage transactions", async () => {
    businessApi.getMemberships.mockResolvedValue(owner);
    renderTopbar();
    expect(await screen.findByLabelText("Add transaction")).toBeTruthy();
  });

  it("hides Add transaction when showAddTransaction is false, even for an owner", async () => {
    businessApi.getMemberships.mockResolvedValue(ownerWithInvitation);
    renderTopbar({ showAddTransaction: false });

    // The invitation badge proves memberships (and the owner role) are
    // live - the button is absent because of the prop, not the loading
    // state.
    await screen.findByLabelText("Invitations (1 pending)");
    expect(screen.queryByLabelText("Add transaction")).toBeNull();
  });

  it("hides Add transaction for a viewer even when the prop allows it", async () => {
    businessApi.getMemberships.mockResolvedValue({
      ...viewer,
      invitations: [{ id: "inv-1" }],
    });
    renderTopbar();

    await screen.findByLabelText("Invitations (1 pending)");
    expect(screen.queryByLabelText("Add transaction")).toBeNull();
  });

  it("keeps the search trigger as a bordered control", () => {
    businessApi.getMemberships.mockResolvedValue(owner);
    renderTopbar();
    const search = screen.getByLabelText("Search (Ctrl+K)");
    expect(search.className).toContain("border-input");
    expect(search.className).toContain("bg-card");
  });
});
