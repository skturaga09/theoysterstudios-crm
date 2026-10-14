import { format, formatDistanceToNowStrict } from "date-fns";
import { enIN } from "date-fns/locale";
import { TZDate } from "@date-fns/tz";

export const IST = "Asia/Kolkata";

const inIST = (d: Date | number | string) => new TZDate(new Date(d), IST);

/** "14 Oct" */
export const fmtDay = (d: Date | number | string) => format(inIST(d), "d MMM", { locale: enIN });
/** "Wed 14 Oct 2026" */
export const fmtDate = (d: Date | number | string) => format(inIST(d), "EEE d MMM yyyy", { locale: enIN });
/** "Wednesday · 14 October 2026" — Home eyebrow */
export const fmtEyebrow = (d: Date | number | string) => format(inIST(d), "EEEE · d MMMM yyyy", { locale: enIN });
/** "14:20" (24h, IST) */
export const fmtTime = (d: Date | number | string) => format(inIST(d), "HH:mm", { locale: enIN });
/** "32m ago" */
export const fmtAgo = (d: Date | number | string) =>
  Date.now() - +new Date(d) < 45_000
    ? "just now"
    : formatDistanceToNowStrict(new Date(d), { locale: enIN })
    .replace(/ seconds?/, "s")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d") + " ago";

/** Greeting by IST hour. */
export function greeting(d: Date = new Date()): string {
  const h = inIST(d).getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
