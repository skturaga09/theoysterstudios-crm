import { describe, expect, it } from "vitest";
import { gstState } from "./gst";
import { UpdateTaskSchema, WorkspaceSchema } from "./schemas";

it("validates and normalises workspace details", () => {
  const w = WorkspaceSchema.parse({ studioName: " The Oyster Studios ", gstin: " 29abcde1234f1z5 ", instagramHandle: "theoysterstudios", whatsappNumber: "+91 98765-43210", googleDomain: "TheOysterStudios.com" });
  expect(w).toMatchObject({ studioName: "The Oyster Studios", gstin: "29ABCDE1234F1Z5", instagramHandle: "@theoysterstudios", whatsappNumber: "+919876543210", googleDomain: "theoysterstudios.com", enquiryEmail: "", legalName: "" });
  expect(gstState(w.gstin)).toBe("Karnataka");
  expect(WorkspaceSchema.safeParse({ studioName: "x", gstin: "99ABCDE1234F1Z5" }).success).toBe(false); // no state 99
  expect(WorkspaceSchema.safeParse({ studioName: "x", whatsappNumber: "98765 43210" }).success).toBe(false); // needs +country code
  expect(WorkspaceSchema.safeParse({ studioName: "x", gstin: "   " }).data?.gstin).toBe(""); // blank = not set
});

describe("update schemas", () => {
  it("leave out fields a change didn't mention instead of resetting them to defaults", () => {
    expect(UpdateTaskSchema.parse({ done: true })).toEqual({ done: true });
  });
});
