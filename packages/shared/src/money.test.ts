import { describe, expect, it } from "vitest";
import { crore, formatCompact, formatFull, lakh } from "./money";

describe("money", () => {
  it("formats lakh", () => expect(formatCompact(lakh(13))).toBe("₹13.0 L"));
  it("formats crore", () => expect(formatCompact(crore(1.24))).toBe("₹1.24 Cr"));
  it("formats full with Indian grouping", () => expect(formatFull(lakh(13))).toBe("₹13,00,000"));
  it("stores integer paise", () => expect(Number.isInteger(lakh(7.2))).toBe(true));
});
