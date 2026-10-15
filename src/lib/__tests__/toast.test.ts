import { describe, it, expect, vi } from "vitest";

const sonnerMock = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), promise: vi.fn() },
}));

vi.mock("sonner", () => sonnerMock);

import { toastSuccess, toastError, toastPromise } from "@/lib/toast";

describe("toast helper", () => {
  it("toastSuccess announces past-tense success with an optional action", () => {
    const action = { label: "Undo", onClick: () => {} };
    toastSuccess("Customer archived", action);
    expect(sonnerMock.toast.success).toHaveBeenCalledWith("Customer archived", {
      action,
    });
  });

  it("toastError says what failed and what to do", () => {
    toastError("archive customer");
    expect(sonnerMock.toast.error).toHaveBeenCalledWith(
      "Could not archive customer. Try again.",
    );
  });

  it("toastPromise forwards loading/success/error messages", async () => {
    const promise = Promise.resolve(1);
    await toastPromise(promise, {
      loading: "Saving",
      success: "Saved",
      error: "Could not save. Try again.",
    });
    expect(sonnerMock.toast.promise).toHaveBeenCalledWith(promise, {
      loading: "Saving",
      success: "Saved",
      error: "Could not save. Try again.",
    });
  });
});
