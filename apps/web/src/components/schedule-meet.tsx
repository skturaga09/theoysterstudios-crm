import { istDay } from "@pinnacle/shared";
import { Button, Input, Select, Sheet, Textarea, toast } from "@pinnacle/ui";
import { Video } from "lucide-react";
import { useState } from "react";
import { useCrm } from "../data/store";
import type { Activity } from "../data/types";
import { api } from "../lib/api";
import { IS_DEMO } from "../lib/demo";

/**
 * "Google Meet" button: books a meeting with the client on your own Google Calendar, with a Meet link, and Google
 * emails them the invite. The meeting shows on the lead's or client's timeline, the CRM Calendar and Home.
 */
export function ScheduleMeet({ companyId, dealId, title: suggested, size = "sm" }: { companyId?: string; dealId?: string; title?: string; size?: "sm" | "default" }) {
  const s = useCrm();
  const deal = s.deals.find((d) => d.id === dealId);
  const company = s.companies.find((c) => c.id === (companyId ?? deal?.companyId));
  // The client's people with an email: the deal's contact first.
  const emails = [...new Set(s.contacts.filter((c) => c.email && (c.id === deal?.contactId || (company && c.companyId === company.id))).sort((a, b) => Number(b.id === deal?.contactId) - Number(a.id === deal?.contactId)).map((c) => c.email!))];
  const blank = () => ({ title: suggested ?? `${company?.name ?? "Client"} · call with The Oyster Studios`, day: istDay(new Date(Date.now() + 86400_000).toISOString()), time: "11:00", minutes: "30", guests: emails.join(", "), notes: "" });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const put = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const field = "flex flex-col gap-1";
  const lab = "t-meta text-ink-3";
  return (
    <>
      <Button size={size} onClick={() => { setF(blank()); setOpen(true); }}><Video strokeWidth={1.5} /> Google Meet</Button>
      <Sheet open={open} onOpenChange={setOpen} eyebrow={company?.name ?? "Meeting"} title="Schedule a Google Meet">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const guests = f.guests.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
            if (!guests.length) return toast("Add the client's email so they get the invite");
            setBusy(true);
            try {
              const start = `${f.day}T${f.time}:00+05:30`;
              const r = IS_DEMO
                ? { meetLink: "https://meet.google.com/demo-link", activity: { id: `a-${Date.now()}`, type: "meeting", actorId: "sr", text: `scheduled a Google Meet: ${f.title}`, at: new Date().toISOString(), meetingAt: start, meetLink: "https://meet.google.com/demo-link", dealId, companyId: company?.id } as Activity }
                : await api<{ meetLink: string; activity: Activity }>("/meetings", { method: "POST", body: { title: f.title.trim(), start, minutes: Number(f.minutes), guests, ...(f.notes.trim() && { notes: f.notes.trim() }), ...(dealId && { dealId }), ...(company && { companyId: company.id }) } });
              useCrm.setState((x) => ({ activities: [r.activity, ...x.activities] }));
              setOpen(false);
              toast("Meeting booked · the client gets the Google invite", { action: { label: "Copy Meet link", onClick: () => void navigator.clipboard.writeText(r.meetLink) } });
            } catch (err) {
              toast(`Couldn't book it — ${(err as Error).message}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className={field}><span className={lab}>Title</span><Input value={f.title} onChange={(e) => put({ title: e.target.value })} required /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className={field}><span className={lab}>Date</span><Input type="date" value={f.day} min={istDay(new Date().toISOString())} onChange={(e) => put({ day: e.target.value })} required /></label>
            <label className={field}><span className={lab}>Time (IST)</span><Input type="time" value={f.time} onChange={(e) => put({ time: e.target.value })} required /></label>
            <label className={field}><span className={lab}>Length</span>
              <Select value={f.minutes} onChange={(e) => put({ minutes: e.target.value })}>
                {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`}</option>)}
              </Select>
            </label>
          </div>
          <label className={field}><span className={lab}>Client's email (more than one: separate with commas)</span>
            <Input value={f.guests} onChange={(e) => put({ guests: e.target.value })} placeholder="riya@example.com" />
          </label>
          <label className={field}><span className={lab}>Agenda (goes in the invite)</span><Textarea rows={3} value={f.notes} onChange={(e) => put({ notes: e.target.value })} placeholder="What you'll go through" /></label>
          <p className="t-meta m-0 text-ink-3">Booked on your Google Calendar with a Google Meet link. Google emails the invite to the client; it also shows on this client's timeline, the CRM Calendar and Home.</p>
          <Button type="submit" variant="ink" disabled={busy} className="self-start">{busy ? "Booking…" : "Book the meeting"}</Button>
        </form>
      </Sheet>
    </>
  );
}
