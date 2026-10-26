import { describe, it, expect } from "vitest";
import { AppError, toAppError } from "@/lib/AppError";

describe("toAppError", () => {
  it("passes AppError through unchanged", () => {
    const err = new AppError("forbidden", "nope");
    expect(toAppError(err)).toBe(err);
  });

  it("maps TypeError (fetch failure) to network", () => {
    const err = toAppError(new TypeError("Failed to fetch"));
    expect(err.code).toBe("network");
    expect(err.message).toMatch(/network/i);
  });

  it("maps SQLSTATE 42501 to forbidden", () => {
    const err = toAppError({ code: "42501", message: "permission denied" });
    expect(err.code).toBe("forbidden");
  });

  it("maps row-level security message to forbidden", () => {
    const err = toAppError({
      code: "42501",
      message: "new row violates row-level security policy for table customers",
    });
    expect(err.code).toBe("forbidden");
  });

  it("maps unique violation to validation", () => {
    const err = toAppError({ code: "23505", message: "duplicate key" });
    expect(err.code).toBe("validation");
  });

  it("maps foreign key violation to validation", () => {
    const err = toAppError({ code: "23503", message: "fkey" });
    expect(err.code).toBe("validation");
  });

  it("maps 22001 (value too long) to validation, showing the database message (S-51)", () => {
    // S-51 changed this: the v3 database functions author user-safe
    // messages, so the message now travels through for 22001.
    const err = toAppError({
      code: "22001",
      message: "Name must be 100 characters or fewer.",
    });
    expect(err.code).toBe("validation");
    expect(err.message).toBe("Name must be 100 characters or fewer.");
  });

  it("maps other Postgres data errors to validation with a user-safe message", () => {
    const err = toAppError({
      code: "22003",
      message: "numeric field overflow",
    });
    expect(err.code).toBe("validation");
    expect(err.message).not.toMatch(/numeric field overflow/);
  });

  it("maps SQLSTATE P0002 to notFound with the database message (S-51)", () => {
    const err = toAppError({
      code: "P0002",
      message: "Customer not found.",
    });
    expect(err.code).toBe("notFound");
    expect(err.message).toBe("Customer not found.");
  });

  it("falls back to a friendly notFound message when P0002 carries none", () => {
    const err = toAppError({ code: "P0002" });
    expect(err.code).toBe("notFound");
    expect(err.message).toBe("That item no longer exists.");
  });

  it("maps SQLSTATE 55000 to conflict with the database message (S-51)", () => {
    const err = toAppError({
      code: "55000",
      message: "Restore the customer first.",
    });
    expect(err.code).toBe("conflict");
    expect(err.message).toBe("Restore the customer first.");
  });

  it("maps Postgrest errors to unknown with a user-safe message", () => {
    const err = toAppError({ code: "PGRST116", message: "The result contains 0 rows" });
    expect(err.code).toBe("unknown");
    expect(err.message).not.toMatch(/PGRST/);
  });

  it("maps generic errors to unknown", () => {
    const err = toAppError(new Error("weird"));
    expect(err.code).toBe("unknown");
    expect(err.message).toBe("Something went wrong. Please try again.");
  });

  it("maps non-error values to unknown", () => {
    expect(toAppError("oops").code).toBe("unknown");
    expect(toAppError(null).code).toBe("unknown");
    expect(toAppError(undefined).code).toBe("unknown");
  });
});
