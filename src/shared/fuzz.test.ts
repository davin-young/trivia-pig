import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseCookies } from "../server/crypto";
import { boardContentSchema } from "./board";
import { boardFromCsv, boardFromJson, parseDelimited } from "./importBoard";

// Property-based (fuzz) tests for the parsers that take untrusted input:
// uploaded CSV/JSON boards and the Cookie header on every socket handshake.

const quote = (field: string) => `"${field.replace(/"/g, '""')}"`;

describe("fuzz: parseDelimited", () => {
  it("never throws and only returns strings", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (text) => {
        const rows = parseDelimited(text);
        expect(rows.every((r) => r.every((f) => typeof f === "string"))).toBe(true);
      }),
    );
  });

  it("round-trips quoted fields, whatever they contain", () => {
    const field = fc.string({ unit: "binary", minLength: 1 });
    const rows = fc.array(fc.array(field, { minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 8 });
    fc.assert(
      fc.property(rows, (input) => {
        const csv = input.map((r) => r.map(quote).join(",")).join("\n");
        // The parser trims every field and drops rows that are blank after trimming.
        const expected = input.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ""));
        expect(parseDelimited(csv, ",")).toEqual(expected);
      }),
    );
  });
});

describe("fuzz: board import", () => {
  it("CSV import returns a valid board or throws an Error", () => {
    const cell = fc.oneof(fc.string(), fc.constantFrom("1", "2", "final", "Double", "$200", "yes", ""));
    const csv = fc
      .array(fc.array(cell, { maxLength: 7 }), { maxLength: 40 })
      .map((rows) => rows.map((r) => r.map(quote).join(",")).join("\n"));
    fc.assert(
      fc.property(fc.oneof(csv, fc.string({ unit: "binary" })), (text) => {
        try {
          expect(boardContentSchema.safeParse(boardFromCsv(text)).success).toBe(true);
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
        }
      }),
    );
  });

  it("JSON import returns a valid board or throws an Error", () => {
    fc.assert(
      fc.property(fc.oneof(fc.jsonValue(), fc.anything()), (raw) => {
        try {
          expect(boardContentSchema.safeParse(boardFromJson(raw).content).success).toBe(true);
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
        }
      }),
    );
  });
});

describe("fuzz: parseCookies", () => {
  it("never throws and cannot replace the result's prototype", () => {
    const header = fc.oneof(
      fc.string({ unit: "binary" }),
      fc
        .array(fc.tuple(fc.constantFrom("__proto__", "constructor", "toString", "sid", " a "), fc.string()), { maxLength: 6 })
        .map((pairs) => pairs.map(([k, v]) => `${k}=${v}`).join("; ")),
    );
    fc.assert(
      fc.property(header, (text) => {
        const out = parseCookies(text);
        expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
        expect(Object.values(out).every((v) => typeof v === "string")).toBe(true);
      }),
    );
  });
});
