import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES } from "./domain";
import { deliveryWindow, istDay, planProject, splitNames } from "./projects";
import { TemplatesSchema, UpdateProjectSchema } from "./schemas";

describe("planProject", () => {
  it("dates wedding tasks from the event and falls back to the confirmation day", () => {
    const { tasks, deliverables } = planProject(DEFAULT_TEMPLATES.photography, { confirmedAt: "2026-10-19T20:00:00Z", eventDate: "2026-12-10" });
    expect(tasks[0]).toMatchObject({ title: "Booking advance received", dueAt: "2026-10-23T18:00:00+05:30" }); // 20:00Z = 20 Oct IST, +3
    expect(tasks.find((t) => t.title === "Wedding day coverage")!.dueAt).toBe("2026-12-10T18:00:00+05:30");
    expect(tasks.find((t) => t.title === "Assign photo and video crew")!.dueAt).toBe("2026-11-19T18:00:00+05:30");
    expect(tasks.filter((t) => t.approval === "pending")).toHaveLength(2);
    expect(deliverables[0]).toEqual({ id: "d1", name: "Edited photos", dueDate: "2026-12-24", status: "pending" });
    const noDate = planProject(DEFAULT_TEMPLATES.photography, { confirmedAt: "2026-10-19T20:00:00Z" });
    expect(noDate.tasks.find((t) => t.title === "Wedding day coverage")!.dueAt).toBe("2026-10-20T18:00:00+05:30");
    expect(noDate.tasks.find((t) => t.title === "Assign photo and video crew")!.dueAt).toBe("2026-10-20T18:00:00+05:30"); // not back-dated
    const late = planProject(DEFAULT_TEMPLATES.photography, { confirmedAt: "2026-12-01T06:00:00Z", eventDate: "2026-12-10" });
    expect(late.tasks.find((t) => t.title === "Confirm functions, timings and venue")!.dueAt).toBe("2026-12-01T18:00:00+05:30");
  });
  it("uses the IST day", () => expect(istDay("2026-10-19T19:00:00Z")).toBe("2026-10-20"));
});

describe("function crew", () => {
  it("splits typed crew names", () => {
    expect(splitNames("Aniketh & Arun")).toEqual(["Aniketh", "Arun"]);
    expect(splitNames(" Bobby, Teju and Ravi ,")).toEqual(["Bobby", "Teju", "Ravi"]);
    expect(splitNames("Anand")).toEqual(["Anand"]); // "and" inside a name stays
    expect(splitNames("")).toEqual([]);
  });
  it("keeps the lineup when a project is saved", () => {
    const e = { id: "e1", name: "Wedding", photo: 2, photoCrew: ["Aniketh", "Arun"], video: 2, videoCrew: ["Bobby", "Teju"], addOns: "Drone", duration: "4 pm – 11 pm" };
    expect(UpdateProjectSchema.parse({ events: [e] }).events?.[0]).toEqual(e);
  });
});

describe("custom function columns", () => {
  it("saves the studio's columns and each function's values", () => {
    const columns = [{ id: "col-1", label: "Makeup artist" }];
    expect(TemplatesSchema.parse({ ...DEFAULT_TEMPLATES, photography: { ...DEFAULT_TEMPLATES.photography, columns } }).photography.columns).toEqual(columns);
    expect(UpdateProjectSchema.parse({ events: [{ id: "e1", name: "Haldi", extra: { "col-1": "Priya" } }] }).events?.[0]?.extra).toEqual({ "col-1": "Priya" });
  });
  it("rejects nameless columns and too many values", () => {
    expect(() => TemplatesSchema.parse({ ...DEFAULT_TEMPLATES, photography: { ...DEFAULT_TEMPLATES.photography, columns: [{ id: "c", label: " " }] } })).toThrow();
    const extra = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`c${i}`, "x"]));
    expect(() => UpdateProjectSchema.parse({ events: [{ id: "e1", name: "Haldi", extra }] })).toThrow();
  });
});

describe("delivery after photo selection", () => {
  it("is 3 to 5 weeks after the couple's selection", () => {
    expect(deliveryWindow("2026-10-29")).toEqual({ from: "2026-11-19", to: "2026-12-03" });
    expect(deliveryWindow(undefined)).toBeUndefined();
  });
});
