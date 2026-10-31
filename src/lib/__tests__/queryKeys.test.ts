import { describe, it, expect } from "vitest";
import {
  customerKeys,
  dashboardKeys,
  deletionLogKeys,
  importKeys,
  transactionKeys,
} from "@/lib/queryKeys";

describe("query key hygiene", () => {
  it("every scoped factory output starts with the business prefix", () => {
    const scoped: Array<[string, readonly unknown[]]> = [
      ["customerKeys.list(b1)", customerKeys.list("b1")],
      ["customerKeys.detail(c1, b1)", customerKeys.detail("c1", "b1")],
      ["customerKeys.balance(c1, b1)", customerKeys.balance("c1", "b1")],
      ["transactionKeys.list(b1)", transactionKeys.list("b1")],
      ["transactionKeys.detail(t1, b1)", transactionKeys.detail("t1", "b1")],
      ["transactionKeys.byCustomer(c1, b1)", transactionKeys.byCustomer("c1", "b1")],
      ["transactionKeys.pagedList(b1)", transactionKeys.pagedList("b1")],
      ["transactionKeys.rollup(b1)", transactionKeys.rollup("b1")],
      ["transactionKeys.summary(b1)", transactionKeys.summary("b1")],
      ["dashboardKeys.daily(b1, 7)", dashboardKeys.daily("b1", 7)],
      ["dashboardKeys.feed(b1)", dashboardKeys.feed("b1")],
      ["importKeys.customers(b1)", importKeys.customers("b1")],
      ["deletionLogKeys.all(b1)", deletionLogKeys.all("b1")],
      ["deletionLogKeys.list(b1)", deletionLogKeys.list("b1")],
      ["deletionLogKeys.list(b1, customer)", deletionLogKeys.list("b1", "customer")],
    ];

    for (const [label, key] of scoped) {
      expect(key[0], `${label} should start with 'business'`).toBe("business");
      expect(key[1], `${label} should start with the business id`).toBe("b1");
    }
  });

  it("unscoped keys remain valid during the transition (TODO S-20)", () => {
    expect(customerKeys.list()).toEqual(["customers", "list"]);
    expect(customerKeys.detail("c1")).toEqual(["customers", "c1"]);
    expect(transactionKeys.byCustomer("c1")).toEqual([
      "transactions",
      "customer",
      "c1",
    ]);
  });

  it("the deletion log filter defaults to 'all' and separates per filter (S-51)", () => {
    expect(deletionLogKeys.list("b1")).toEqual([
      "business",
      "b1",
      "deletion-log",
      "list",
      "all",
    ]);
    expect(deletionLogKeys.list("b1", "transaction")).toEqual([
      "business",
      "b1",
      "deletion-log",
      "list",
      "transaction",
    ]);
  });
});
