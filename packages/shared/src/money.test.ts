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

describe("typed amounts", () => {
  it("reads exact rupees and the usual shorthands", async () => {
    const { parseRupees, rupeesText } = await import("./money");
    expect(parseRupees("58,950")).toBe(58_950_00);
    expect(parseRupees("₹ 58950.50")).toBe(58_950_50);
    expect(parseRupees("Rs. 1,18,000")).toBe(1_18_000_00);
    expect(parseRupees("2.5L")).toBe(2_50_000_00);
    expect(parseRupees("2.5 lakh")).toBe(2_50_000_00);
    expect(parseRupees("75k")).toBe(75_000_00);
    expect(parseRupees("1.2cr")).toBe(1_20_00_000_00);
    expect(parseRupees("")).toBeUndefined();
    expect(parseRupees("abc")).toBeUndefined();
    expect(rupeesText(1_18_000_00)).toBe("1,18,000");
    expect(rupeesText(58_950_50)).toBe("58,950.5");
  });
});
