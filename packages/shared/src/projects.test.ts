import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES } from "./domain";
import { istDay, planProject } from "./projects";

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
