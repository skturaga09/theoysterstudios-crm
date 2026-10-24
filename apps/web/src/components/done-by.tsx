import { useCrm } from "../data/store";
import type { Task } from "../data/types";

/** "20 Oct, 4:10 pm" in IST. */
export const doneTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Who completed a task and when: "Done by Riya V · 20 Oct, 4:10 pm". */
export function DoneBy({ t, short }: { t: Task; short?: boolean }) {
  const who = useCrm((s) => s.members.find((m) => m.id === t.doneBy)?.name);
  if (!t.done) return null;
  const by = t.doneBy === "support" ? "Support" : who;
  return (
    <span className="fs-11.5 text-ok" title={t.doneAt ? `Completed ${doneTime(t.doneAt)}${by ? ` by ${by}` : ""}` : "Completed"}>
      {short ? "✓ " : "Done "}
      {by && `${short ? "" : "by "}${by.split(" ")[0]}`}
      {t.doneAt && `${by ? " · " : ""}${doneTime(t.doneAt)}`}
    </span>
  );
}
