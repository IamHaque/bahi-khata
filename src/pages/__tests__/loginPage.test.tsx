import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderApp } from "@/test/app-render";
import { LoginPage } from "@/pages/Login";
import { paths, routePatterns } from "@/lib/paths";

// LoginPage reads the business context for the deep-link redirect; the
// stub keeps it out of the provider (same approach as axePages).
vi.mock("@/contexts/BusinessContext", () => ({
  BusinessProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useActiveBusiness: () => ({
    business: null,
    role: null,
    isOwner: false,
    status: "none",
  }),
  useBusinessContext: () => ({
    status: "none",
    business: null,
    role: null,
    isOwner: false,
    error: null,
  }),
}));

// L-11 — the branded login: one centred ledger sheet with the tally
// mark, the name, the tagline, exactly one Google button and the
// privacy line.
describe("L-11 login", () => {
  it("is branded and calm: tally mark, name, tagline, one Google button, privacy line", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.login} element={<LoginPage />} />
      </Routes>,
      { route: paths.login },
    );

    await screen.findByRole("button", { name: /Continue with Google/ });

    // The tally mark (an aria-hidden svg) tops the sheet.
    expect(container.querySelector("svg.size-9")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "BahiKhata" }),
    ).toBeTruthy();
    expect(screen.getByText("Your business ledger")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /Continue with Google/ }),
    ).toHaveLength(1);
    expect(
      screen.getByText("We only read your name and email."),
    ).toBeTruthy();
  });
});
