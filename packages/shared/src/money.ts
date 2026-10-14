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
