import { expect, it } from "vitest";
import { lakh } from "./money";
import { routeLead, type RoutingRule } from "./routing";

const rules: RoutingRule[] = [
  { id: "1", minPaise: lakh(10), ownerId: "big" },
  { id: "2", channel: "instagram", ownerId: "insta" },
  { id: "3", channel: "gmail", city: "Goa", ownerId: "goa-mail" },
];

it("picks the first matching rule, top to bottom", () => {
  expect(routeLead(rules, { channel: "instagram", valuePaise: lakh(12) })).toBe("big");
  expect(routeLead(rules, { channel: "instagram", valuePaise: lakh(2) })).toBe("insta");
  expect(routeLead(rules, { channel: "instagram" })).toBe("insta"); // unknown value skips the value rule
  expect(routeLead(rules, { channel: "gmail", city: " goa " })).toBe("goa-mail"); // all conditions, any case
  expect(routeLead(rules, { channel: "gmail", city: "Pune" })).toBeUndefined();
  expect(routeLead(rules, { channel: "instagram" }, (id) => id !== "insta")).toBeUndefined(); // owner left the team
});
