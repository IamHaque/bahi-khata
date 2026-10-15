import { describe, it, expect } from "vitest";
import { escapeCsvCell, toCsv } from "@/features/import-export/csv";

// S-39 — the safe-CSV rule the PRD pins: any cell beginning with =, +,
// - or @ is prefixed so no spreadsheet executes it on open.

describe("escapeCsvCell (S-39)", () => {
  it("prefixes the four formula markers", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvCell("+1+cmd|' /C calc'!A0")).toBe("'+1+cmd|' /C calc'!A0");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
    expect(escapeCsvCell("@here")).toBe("'@here");
  });

  it("leaves ordinary cells and bare numbers alone", () => {
    expect(escapeCsvCell("Asha Verma")).toBe("Asha Verma");
    expect(escapeCsvCell(1500)).toBe("1500");
    // NOTE: a plain negative number also gets the apostrophe — the PRD
    // asks for every leading "-", and a leading "-" can start a
    // formula ("=1+1" style) just as "=" can. Logged as B-10.
    expect(escapeCsvCell(-500)).toBe("'-500");
  });

  it("quotes separators, quotes and newlines", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("prefixes BEFORE quoting so the apostrophe survives", () => {
    expect(escapeCsvCell("=A1,B2")).toBe('"\'=A1,B2"');
  });
});

describe("toCsv (S-39)", () => {
  it("writes the header row then one row per record", () => {
    const csv = toCsv(
      ["name", "balance"],
      [
        ["Asha", 1500],
        ["Rahim", -200],
      ],
    );
    expect(csv).toBe("name,balance\nAsha,1500\nRahim,'-200");
  });

  it("writes just the header when there are no rows", () => {
    expect(toCsv(["name", "phone"], [])).toBe("name,phone");
  });
});
