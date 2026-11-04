import { expect, it, vi } from "vitest";
import { updateCustomer } from "../api";

const calls = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: vi.fn(() => {
    const chain = {
      update: calls.update.mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: { id: "c1", phone: null }, error: null })),
    };
    return chain;
  }) },
}));

it("passes cleared optional values through to the database update", async () => {
  const input = { phone: null, email: null, address: null, alternate_contact_name: null, alternate_contact_phone: null, tags: null, notes: null };
  await updateCustomer("c1", input, "b1");
  expect(calls.update).toHaveBeenCalledWith({ ...input, updated_at: expect.any(String) });
});
