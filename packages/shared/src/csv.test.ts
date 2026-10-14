import { expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

it("parses spreadsheet CSV, including quotes and line breaks inside fields", () => {
  const text = '﻿Name,Email,Notes\r\n"Mehta, Riya",riya@x.com,"Said ""call Tue""\nthen email"\r\nArjun,,\r\n\r\n';
  expect(parseCsv(text)).toEqual([["Name", "Email", "Notes"], ["Mehta, Riya", "riya@x.com", 'Said "call Tue"\nthen email'], ["Arjun", "", ""]]);
});

it("round-trips through toCsv", () => {
  const rows = [{ name: 'Studio "A", Pune', tags: ["Retainer", "Films"], n: 3 }, { name: "B\nline", extra: true }];
  const back = parseCsv(toCsv(rows));
  expect(back[0]).toEqual(["name", "tags", "n", "extra"]);
  expect(back[1]).toEqual(['Studio "A", Pune', "Retainer; Films", "3", ""]);
  expect(back[2]).toEqual(["B\nline", "", "", "true"]);
});
