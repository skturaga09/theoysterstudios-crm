import { expect, it } from "vitest";
import { leadStatusOf } from "./domain";

it("works out where an enquiry stands", () => {
  expect(leadStatusOf({ messages: [{ direction: "in" }] })).toBe("new");
  expect(leadStatusOf({ messages: [{ direction: "in" }, { direction: "out" }] })).toBe("contacted");
  expect(leadStatusOf({ leadStatus: "followup", messages: [] })).toBe("followup");
  expect(leadStatusOf({ leadStatus: "followup", dealId: "d1" })).toBe("converted"); // a deal wins
  expect(leadStatusOf({ leadStatus: "spam", dealId: "d1" })).toBe("spam"); // unless it's spam
});
