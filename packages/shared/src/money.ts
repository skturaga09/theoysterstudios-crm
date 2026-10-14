/**
 * Money is stored as integer paise. Never floats.
 * 1 rupee = 100 paise · 1 lakh = 1,00,000 rupees · 1 crore = 100 lakh.
 */
export type Paise = number;

const PAISE_PER_RUPEE = 100;
const RUPEES_PER_LAKH = 1_00_000;
const RUPEES_PER_CRORE = 1_00_00_000;

export const rupees = (r: number): Paise => Math.round(r * PAISE_PER_RUPEE);
export const lakh = (l: number): Paise => Math.round(l * RUPEES_PER_LAKH * PAISE_PER_RUPEE);
export const crore = (c: number): Paise => Math.round(c * RUPEES_PER_CRORE * PAISE_PER_RUPEE);

export interface CompactMoney {
  /** "13.0" */
  value: string;
  /** "L" | "Cr" | "" */
  unit: "Cr" | "L" | "K" | "";
}

/** Split a paise amount into a compact numeral and unit: ₹13.0 L, ₹1.24 Cr. */
export function compactParts(paise: Paise): CompactMoney {
  const r = paise / PAISE_PER_RUPEE;
  const abs = Math.abs(r);
  if (abs >= RUPEES_PER_CRORE) return { value: (r / RUPEES_PER_CRORE).toFixed(2), unit: "Cr" };
  if (abs >= RUPEES_PER_LAKH) return { value: (r / RUPEES_PER_LAKH).toFixed(1), unit: "L" };
  if (abs >= 1_000) return { value: (r / 1_000).toFixed(1), unit: "K" };
  return { value: Math.round(r).toString(), unit: "" };
}

/** "₹13.0 L" */
export function formatCompact(paise: Paise): string {
  const { value, unit } = compactParts(paise);
  return unit ? `₹${value} ${unit}` : `₹${value}`;
}

const fullFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
/** "₹13,00,000" — Indian digit grouping. */
export function formatFull(paise: Paise): string {
  return `₹${fullFmt.format(Math.round(paise / PAISE_PER_RUPEE))}`;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below100 = (n: number) => (n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
const below1000 = (n: number) => [n >= 100 && `${ONES[Math.floor(n / 100)]} Hundred`, n % 100 && below100(n % 100)].filter(Boolean).join(" ");
/** 1,18,000 → "One Lakh Eighteen Thousand" (Indian grouping: crore, lakh, thousand, hundred). */
function inWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  if (crore) parts.push(`${inWords(crore)} Crore`);
  const rest = n % 1_00_00_000;
  const lakh = Math.floor(rest / 1_00_000);
  const thousand = Math.floor((rest % 1_00_000) / 1_000);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest % 1_000) parts.push(below1000(rest % 1_000));
  return parts.join(" ");
}
/** Amount in words as printed on Indian invoices: "Rupees One Lakh Eighteen Thousand and Fifty Paise Only". */
export function rupeesInWords(paise: Paise): string {
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${inWords(r)}${p ? ` and ${below100(p)} Paise` : ""} Only`;
}
