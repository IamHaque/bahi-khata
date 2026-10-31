import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/test/app-render";
import { Money } from "@/components/app/Money";
import { BalanceBadge, getBalanceStatus } from "@/components/app/BalanceBadge";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { Avatar } from "@/components/app/Avatar";
import { Skeleton, SkeletonRows } from "@/components/app/Skeleton";

describe("Money", () => {
  it("renders the formatted amount right-aligned with tabular numerals", () => {
    renderApp(<Money amount={1234567.5} />);
    const el = screen.getByText("₹12,34,567.50");
    expect(el.className).toContain("text-right");
    expect(el.className).toContain("tabular-nums");
  });

  it("renders a plus sign when signed and positive", () => {
    renderApp(<Money amount={500} signed />);
    expect(screen.getByText("+₹500.00")).toBeTruthy();
  });
});

describe("BalanceBadge", () => {
  it("shows 'Owes you' for a positive balance", () => {
    renderApp(<BalanceBadge balance={500} />);
    expect(screen.getByText("Owes you")).toBeTruthy();
    expect(screen.getByText("₹500.00")).toBeTruthy();
  });

  it("shows 'You owe' for a negative balance", () => {
    renderApp(<BalanceBadge balance={-200} />);
    expect(screen.getByText("You owe")).toBeTruthy();
    expect(screen.getByText("₹200.00")).toBeTruthy();
  });

  it("shows 'Settled' with no amount for zero", () => {
    renderApp(<BalanceBadge balance={0} />);
    expect(screen.getByText("Settled")).toBeTruthy();
  });

  it("is never color-only (text label present for each state)", () => {
    const { unmount } = renderApp(<BalanceBadge balance={500} />);
    expect(screen.getAllByText(/owes/i).length).toBeGreaterThan(0);
    unmount();
    renderApp(<BalanceBadge balance={-200} />);
    expect(screen.getAllByText(/you owe/i).length).toBeGreaterThan(0);
  });

  it("getBalanceStatus maps balances to statuses", () => {
    expect(getBalanceStatus(500)).toBe("owes");
    expect(getBalanceStatus(-200)).toBe("credit");
    expect(getBalanceStatus(0)).toBe("settled");
  });
});

describe("PageHeader", () => {
  it("renders title, description and actions", () => {
    renderApp(
      <PageHeader title="Customers" description="Everyone who owes you">
        <button type="button">Add customer</button>
      </PageHeader>,
    );
    expect(
      screen.getByRole("heading", { name: "Customers" }),
    ).toBeTruthy();
    expect(screen.getByText("Everyone who owes you")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add customer" })).toBeTruthy();
  });
});

describe("StatCard", () => {
  it("renders label, value and hint", () => {
    renderApp(
      <StatCard label="Total owes you" value="₹1,500.00" hint="3 customers" />,
    );
    expect(screen.getByText("Total owes you")).toBeTruthy();
    expect(screen.getByText("₹1,500.00")).toBeTruthy();
    expect(screen.getByText("3 customers")).toBeTruthy();
  });
});

describe("StatusBadge", () => {
  it("renders its label", () => {
    renderApp(<StatusBadge label="Edited" tone="warning" />);
    expect(screen.getByText("Edited")).toBeTruthy();
  });
});

describe("EmptyState", () => {
  it("renders title, description and actions", () => {
    renderApp(
      <EmptyState title="No customers yet" description="Add your first one">
        <button type="button">Add customer</button>
      </EmptyState>,
    );
    expect(screen.getByText("No customers yet")).toBeTruthy();
    expect(screen.getByText("Add your first one")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add customer" })).toBeTruthy();
  });

  it("centres the icon and description with mx-auto and block", () => {
    const { container } = renderApp(
      <EmptyState title="No customers yet" description="Add your first one" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("block");
    expect(svg?.getAttribute("class")).toContain("mx-auto");
    const desc = screen.getByText("Add your first one");
    expect(desc.className).toContain("mx-auto");
  });
});

describe("ErrorState", () => {
  it("renders the message and a retry button that calls onRetry", async () => {
    const onRetry = vi.fn();
    renderApp(
      <ErrorState message="Could not load customers. Try again." onRetry={onRetry} />,
    );
    expect(screen.getByText("Could not load customers. Try again.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("hides retry when no handler is given", () => {
    renderApp(<ErrorState message="Failed" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Avatar", () => {
  it("renders deterministic initials", () => {
    renderApp(
      <div>
        <Avatar name="Asha Verma" />
        <Avatar name="Asha Verma" />
      </div>,
    );
    expect(screen.getAllByText("AV").length).toBe(2);
  });

  it("renders an image when src is given", () => {
    renderApp(<Avatar name="Asha Verma" src="https://example.com/a.png" />);
    expect(screen.getByRole("img")).toBeTruthy();
  });
});

describe("Skeleton", () => {
  it("renders a pulsing placeholder", () => {
    renderApp(<Skeleton className="h-4 w-28" />);
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders the requested number of skeleton rows", () => {
    renderApp(<SkeletonRows count={3} />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
