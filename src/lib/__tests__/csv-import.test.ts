import { describe, it, expect } from "vitest";
import { parseAndValidateCsv, groupByCustomer } from "@/lib/csv-import";

describe("parseAndValidateCsv", () => {
  const VALID_HEADER = "customer_name,customer_phone,type,amount,date,note";

  it("parses a fully valid file", () => {
    const csv = [
      VALID_HEADER,
      "Rahul,9876543210,charge,500,2024-01-15,Groceries",
      "Priya,,payment,200,2024-01-14,Cash payment",
    ].join("\n");

    const result = parseAndValidateCsv(csv);

    expect(result.invalidRows).toHaveLength(0);
    expect(result.validRows).toHaveLength(2);
    const [first, second] = result.validRows;
    expect(first!.customer_name).toBe("Rahul");
    expect(first!.type).toBe("charge");
    expect(first!.amount).toBe(500);
    expect(second!.customer_name).toBe("Priya");
    expect(second!.type).toBe("payment");
    expect(second!.amount).toBe(200);
  });

  it("returns error for empty file", () => {
    const result = parseAndValidateCsv("");
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]!.field).toBe("file");
  });

  it("returns error for missing required columns", () => {
    const csv = ["customer_name,phone\ndata1,data2"].join("\n");
    const result = parseAndValidateCsv(csv);
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows[0]!.field).toBe("headers");
    expect(result.invalidRows[0]!.message).toContain("Missing required columns");
  });

  it("rejects row with missing customer name", () => {
    const csv = [
      VALID_HEADER,
      ",9876543210,charge,500,2024-01-15,note",
    ].join("\n");

    const result = parseAndValidateCsv(csv);
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]!.field).toBe("customer_name");
  });

  it("rejects row with invalid type", () => {
    const csv = [
      VALID_HEADER,
      "Rahul,9876543210,refund,500,2024-01-15,note",
    ].join("\n");

    const result = parseAndValidateCsv(csv);
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]!.field).toBe("type");
  });

  it("rejects row with non-numeric amount", () => {
    const csv = [
      VALID_HEADER,
      "Rahul,9876543210,charge,abc,2024-01-15,note",
    ].join("\n");

    const result = parseAndValidateCsv(csv);
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]!.field).toBe("amount");
  });

  it("rejects row with zero amount", () => {
    const csv = [
      VALID_HEADER,
      "Rahul,9876543210,charge,0,2024-01-15,note",
    ].join("\n");

    const result = parseAndValidateCsv(csv);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]!.field).toBe("amount");
  });

  it("rejects row with negative amount", () => {
    const csv = [
      VALID_HEADER,
      "Rahul,9876543210,charge,-100,2024-01-15,note",
    ].join("\n");

    const result = parseAndValidateCsv(csv);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]!.field).toBe("amount");
  });

  it("rejects row with future date", () => {
    const csv = [
      VALID_HEADER,
      "Rahul,9876543210,charge,500,2099-12-31,note",
    ].join("\n");

    const result = parseAndValidateCsv(csv);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]!.field).toBe("date");
  });

  it("rejects row with unparseable date", () => {
    const csv = [
      VALID_HEADER,
      "Rahul,9876543210,charge,500,not-a-date,note",
    ].join("\n");

    const result = parseAndValidateCsv(csv);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0]!.field).toBe("date");
  });

  it("accepts amount with rupee symbol and commas", () => {
    const csv = [
      VALID_HEADER,
      'Rahul,9876543210,charge,"₹1,500",2024-01-15,note',
    ].join("\n");

    const result = parseAndValidateCsv(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]!.amount).toBe(1500);
  });

  it("accepts case-insensitive type", () => {
    const csv = [
      VALID_HEADER,
      "Rahul,9876543210,Charge,500,2024-01-15,note",
    ].join("\n");

    const result = parseAndValidateCsv(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]!.type).toBe("charge");
  });

  it("produces multiple errors for multiple invalid rows", () => {
    const csv = [
      VALID_HEADER,
      ",9876543210,charge,500,2024-01-15,note",
      "Rahul,9876543210,refund,500,2024-01-15,note",
      "Priya,9876543210,charge,abc,2024-01-15,note",
    ].join("\n");

    const result = parseAndValidateCsv(csv);
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows).toHaveLength(3);
  });
});

describe("groupByCustomer", () => {
  it("groups rows with same name and phone into one customer", () => {
    const rows = [
      {
        customer_name: "Rahul",
        customer_phone: "9876543210",
        type: "charge" as const,
        amount: 500,
        date: "2024-01-15T00:00:00.000Z",
        note: "",
        rowNumber: 2,
      },
      {
        customer_name: "Rahul",
        customer_phone: "9876543210",
        type: "payment" as const,
        amount: 200,
        date: "2024-01-16T00:00:00.000Z",
        note: "",
        rowNumber: 3,
      },
    ];

    const groups = groupByCustomer(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.customerName).toBe("Rahul");
    expect(groups[0]!.customerPhone).toBe("9876543210");
    expect(groups[0]!.transactions).toHaveLength(2);
  });

  it("groups rows with same name but different phone as separate customers", () => {
    const rows = [
      {
        customer_name: "Rahul",
        customer_phone: "9876543210",
        type: "charge" as const,
        amount: 500,
        date: "2024-01-15T00:00:00.000Z",
        note: "",
        rowNumber: 2,
      },
      {
        customer_name: "Rahul",
        customer_phone: "9999999999",
        type: "charge" as const,
        amount: 300,
        date: "2024-01-16T00:00:00.000Z",
        note: "",
        rowNumber: 3,
      },
    ];

    const groups = groupByCustomer(rows);
    expect(groups).toHaveLength(2);
  });

  it("groups rows with same name and no phone as one customer", () => {
    const rows = [
      {
        customer_name: "Rahul",
        customer_phone: "",
        type: "charge" as const,
        amount: 500,
        date: "2024-01-15T00:00:00.000Z",
        note: "",
        rowNumber: 2,
      },
      {
        customer_name: "Rahul",
        customer_phone: "",
        type: "payment" as const,
        amount: 200,
        date: "2024-01-16T00:00:00.000Z",
        note: "",
        rowNumber: 3,
      },
    ];

    const groups = groupByCustomer(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.transactions).toHaveLength(2);
  });

  it("handles empty input", () => {
    const groups = groupByCustomer([]);
    expect(groups).toHaveLength(0);
  });
});

// BUG-003 regression guard: date-only strings like "2024-01-15" must parse
// to the local calendar date 2024-01-15, not shift by a day in timezones
// ahead of UTC (e.g. IST).
describe("BUG-003 timezone regression (STORY-035)", () => {
  it("date-only string '2024-01-15' parses to local date 2024-01-15", () => {
    const csv = [
      "customer_name,customer_phone,type,amount,date,note",
      "Rahul,9876543210,charge,500,2024-01-15,note",
    ].join("\n");

    const result = parseAndValidateCsv(csv);
    expect(result.validRows).toHaveLength(1);

    const parsed = new Date(result.validRows[0]!.date);
    expect(parsed.getFullYear()).toBe(2024);
    expect(parsed.getMonth()).toBe(0); // January (0-indexed)
    expect(parsed.getDate()).toBe(15);
  });
});
