import { describe, expect, it } from "vitest";
import { crore, formatCompact, formatFull, lakh, rupeesInWords } from "./money";

describe("money", () => {
  it("formats lakh", () => expect(formatCompact(lakh(13))).toBe("₹13.0 L"));
  it("formats crore", () => expect(formatCompact(crore(1.24))).toBe("₹1.24 Cr"));
  it("formats full with Indian grouping", () => expect(formatFull(lakh(13))).toBe("₹13,00,000"));
  it("stores integer paise", () => expect(Number.isInteger(lakh(7.2))).toBe(true));
});

it("writes amounts in words, Indian style", () => {
  expect(rupeesInWords(118000_00)).toBe("Rupees One Lakh Eighteen Thousand Only");
  expect(rupeesInWords(12_34_56_789_50)).toBe("Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Fifty Paise Only");
  expect(rupeesInWords(101_00)).toBe("Rupees One Hundred One Only");
  expect(rupeesInWords(5)).toBe("Rupees Zero and Five Paise Only");
  expect(rupeesInWords(1000_00_00_000_00)).toBe("Rupees One Thousand Crore Only");
});
