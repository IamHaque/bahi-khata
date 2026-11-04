import { describe, expect, it } from "vitest";
import { amountField } from "../schemas";
import { parseAndValidateCsv } from "@/lib/csv-import";

describe("amountField", () => {
  it.each([0.01, 1, 100.1, 99999.99, 12345.67, 1234567.89, 9999999.99, 999999999.99])("accepts %s", (value) => {
    expect(amountField.safeParse(value).success).toBe(true);
  });
  it.each([0, -1, 0.001, 1.234, 1234567.891, 1e-7, NaN, Infinity, 1000000000, 1000000000.01])("rejects %s in forms and imports", (value) => {
    expect(amountField.safeParse(value).success).toBe(false);
    const result = parseAndValidateCsv(`customer_name,type,amount,date\nAsha,charge,${value},2024-01-15`);
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows[0]?.field).toBe("amount");
  });
  it("reports the supported maximum through the money formatter", () => {
    const result = amountField.safeParse(1000000000);
    expect(result.error?.issues[0]?.message).toBe("Amount must be ₹99,99,99,999.99 or less.");
  });
});
