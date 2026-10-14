/**
 * CSV as Excel, Google Sheets and Notion write it (RFC 4180): commas, "quoted" fields, "" for a quote inside
 * quotes, line breaks inside quotes, CRLF or LF, and a leading byte-order mark.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
  }
  if (field !== "" || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const cell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Objects → CSV with a header row (union of keys, in first-seen order). */
export function toCsv(rows: object[]): string {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [keys.map(cell).join(","), ...rows.map((r) => keys.map((k) => cell((r as Record<string, unknown>)[k])).join(","))].join("\r\n");
}
