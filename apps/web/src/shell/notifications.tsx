import { fmtAgo } from "@pinnacle/shared";
import { Button, cn, Menu, MenuContent, MenuTrigger } from "@pinnacle/ui";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { IS_DEMO } from "../lib/demo";

type Note = { id: string; kind: string; text: string; link?: string; at: string; read: boolean };

const SAMPLE: Note[] = [
  { id: "n1", kind: "late", text: "Meera Iyer has waited over 30 minutes for a reply", link: "/inbox", at: new Date(Date.now() - 5 * 60_000).toISOString(), read: false },
  { id: "n2", kind: "task", text: "Riya V gave you a task: Shot list and family groups from the couple", link: "/tasks", at: new Date(Date.now() - 50 * 60_000).toISOString(), read: false },
  { id: "n3", kind: "summary", text: "Today: 3 tasks, 1 follow-up (including anything late)", link: "/tasks", at: new Date(Date.now() - 4 * 3_600_000).toISOString(), read: true },
];

const canAlert = () => typeof Notification !== "undefined";

/**
 * The bell: what's been given to me, new leads, late replies and the morning summary. Checks every minute while
 * the CRM is open; with desktop alerts on, new ones also pop up while the tab is in the background.
 */
export function NotificationsBell() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>(IS_DEMO ? SAMPLE : []);
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(() => (canAlert() ? Notification.permission : "denied"));
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (IS_DEMO) return;
    const load = () =>
      api<Note[]>("/notifications").then((list) => {
        // Pop up only what arrived since the last check, and only when the tab isn't being looked at.
        if (seen.current && document.hidden && canAlert() && Notification.permission === "granted")
          for (const n of list.filter((x) => !x.read && !seen.current!.has(x.id)).slice(0, 3)) new Notification("The Oyster Studios", { body: n.text, tag: n.id });
        seen.current = new Set(list.map((x) => x.id));
        setNotes(list);
      }, () => {});
    void load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  const unread = notes.filter((n) => !n.read).length;
  const markRead = () => {
    if (!unread) return;
    setNotes((ns) => ns.map((n) => ({ ...n, read: true })));
    if (!IS_DEMO) void api("/notifications/read", { method: "POST", body: {} }).catch(() => {});
  };

  return (
    <Menu open={open} onOpenChange={(o) => { setOpen(o); if (!o) markRead(); }}>
      <MenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={unread ? `Notifications, ${unread} new` : "Notifications"} className="relative">
          <Bell strokeWidth={1.5} />
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-signal px-1 font-mono text-[10px] leading-4 text-on-ink">{unread > 9 ? "9+" : unread}</span>}
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="w-[340px] max-w-[calc(100vw-32px)] p-0">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="t-eyebrow text-ink-2">Notifications</span>
          {canAlert() && permission === "default" && (
            <button className="t-meta text-ink-3 hover:text-ink" onClick={() => void Notification.requestPermission().then(setPermission)}>Turn on desktop alerts</button>
          )}
        </div>
        <ul className="m-0 max-h-[60vh] list-none overflow-y-auto p-0">
          {notes.map((n) => (
            <li key={n.id}>
              <button
                className={cn("flex w-full flex-col gap-0.5 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-hover", !n.read && "bg-sunken")}
                onClick={() => {
                  setOpen(false);
                  markRead();
                  if (n.link) navigate(n.link);
                }}
              >
                <span className={cn("t-dense", n.kind === "late" && "text-risk")}>{n.text}</span>
                <span className="font-mono text-[11px] text-ink-3">{fmtAgo(n.at)}</span>
              </button>
            </li>
          ))}
          {!notes.length && <li className="t-dense px-3 py-6 text-center text-ink-3">Nothing yet. Work given to you, new leads and late replies show up here.</li>}
        </ul>
      </MenuContent>
    </Menu>
  );
}
