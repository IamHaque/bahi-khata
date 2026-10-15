import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/test/app-render";
import { SearchInput } from "@/components/app/SearchInput";
import { FilterBar, type FilterChip } from "@/components/app/FilterBar";

describe("SearchInput", () => {
  it("emits the value debounced after 300ms", async () => {
    const onValueChange = vi.fn();
    renderApp(<SearchInput value="" onValueChange={onValueChange} />);

    const input = screen.getByRole("searchbox", { name: "Search" });
    await userEvent.type(input, "ash");

    expect(onValueChange).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 350));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith("ash");
  });

  it("is labelled and clearable", async () => {
    const onValueChange = vi.fn();
    renderApp(<SearchInput value="ash" onValueChange={onValueChange} />);

    expect(screen.getByRole("searchbox", { name: "Search" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("syncs when the controlled value changes", async () => {
    const { rerender } = renderApp(
      <SearchInput value="" onValueChange={() => {}} />,
    );
    rerender(<SearchInput value="phone" onValueChange={() => {}} />);
    await waitFor(() =>
      expect(
        (screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement)
          .value,
      ).toBe("phone"),
    );
  });
});

describe("FilterBar", () => {
  it("renders chips with remove buttons and a Clear all action", async () => {
    const chips: FilterChip[] = [
      { label: "Owes you", onRemove: () => {} },
      { label: "This month", onRemove: () => {} },
    ];
    renderApp(<FilterBar chips={chips} onClearAll={() => {}} />);

    expect(screen.getByText("Owes you")).toBeTruthy();
    expect(screen.getByText("This month")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove filter Owes you" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeTruthy();
  });

  it("removes a chip and clears all", async () => {
    const onRemove = vi.fn();
    const onClearAll = vi.fn();
    const chips: FilterChip[] = [{ label: "Owes you", onRemove }];

    renderApp(<FilterBar chips={chips} onClearAll={onClearAll} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove filter Owes you" }));
    expect(onRemove).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("renders nothing without chips or children", () => {
    const { container } = renderApp(
      <FilterBar chips={[]} onClearAll={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
