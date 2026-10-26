import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/components/app/Avatar";
import { renderApp } from "@/test/app-render";

// L-03: a profile photo URL that fails to load must never render as a
// black circle — the initials take its place on the tinted circle.
describe("Avatar image fallback", () => {
  it("shows the initials when the image errors", () => {
    renderApp(
      <Avatar name="Asha Verma" src="https://example.com/broken.png" />,
    );
    const img = screen.getByRole("img");
    fireEvent.error(img);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("AV")).toBeTruthy();
  });

  it("keeps rendering the image when it loads fine", () => {
    renderApp(<Avatar name="Asha Verma" src="https://example.com/a.png" />);
    expect(screen.getByRole("img")).toBeTruthy();
    expect(screen.queryByText("AV")).toBeNull();
  });
});
