import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp } from "@/test/app-render";
import { ConfigError } from "@/components/app/ConfigError";
import { expectNoSeriousViolations } from "@/test/a11y";

describe("ConfigError", () => {
  it("renders the title, the problems and the next step", () => {
    const problems = [
      "VITE_SUPABASE_URL must be a full URL, for example https://abc.supabase.co",
      "VITE_SUPABASE_ANON_KEY is missing or too short",
    ];
    renderApp(<ConfigError problems={problems} />);
    expect(
      screen.getByRole("alert"),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "This app is not configured" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "VITE_SUPABASE_URL must be a full URL, for example https://abc.supabase.co",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("VITE_SUPABASE_ANON_KEY is missing or too short"),
    ).toBeTruthy();
    expect(
      screen.getByText(/Copy \.env\.example to \.env and fill in your Supabase/),
    ).toBeTruthy();
  });

  it("has no serious accessibility violations", async () => {
    const { container } = renderApp(
      <ConfigError problems={["something is wrong"]} />,
    );
    await expectNoSeriousViolations(container);
  });
});
