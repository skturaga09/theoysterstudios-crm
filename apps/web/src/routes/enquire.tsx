import { SERVICES, type Business } from "@pinnacle/shared";
import { Button, cn, Input, Select, Textarea } from "@pinnacle/ui";
import { Camera, Check, Lock, Mail, Megaphone, MessageCircle, Send, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { IS_DEMO } from "../lib/demo";

const BUDGETS: Record<Business, string[]> = {
  photography: ["Under ₹1 lakh", "₹1–2 lakh", "₹2–4 lakh", "₹4–7 lakh", "₹7 lakh and above", "Not sure yet"],
  marketing: ["Under ₹25,000 a month", "₹25,000–50,000 a month", "₹50,000–1 lakh a month", "₹1 lakh+ a month", "One-time project", "Not sure yet"],
};
const COPY: Record<Business, { title: string; lead: string; message: string }> = {
  photography: {
    title: "Let's capture your celebration",
    lead: "Tell us about your wedding — the dates, the functions, the feel you're after — and we'll come back with ideas and a plan that fits.",
    message: "Functions, number of days, how many guests, what you'd love captured…",
  },
  marketing: {
    title: "Let's grow your brand",
    lead: "Share where your brand is today and where you want it to go. We'll suggest a plan for content, ads and design that fits your goals.",
    message: "Your brand, goals, platforms, timelines…",
  },
};
type Field = "name" | "phone" | "email" | "message";

/**
 * The public enquiry form (/enquire, no sign-in): link it from the website's Contact button or embed it. Each
 * enquiry arrives in Inbox as a routed lead within a minute. `?business=marketing` preselects marketing; `?embed`
 * drops the side panel for an iframe.
 */
export function EnquirePage() {
  const params = new URLSearchParams(window.location.search);
  const embedded = params.has("embed");
  const [studio, setStudio] = useState<{ studioName: string; email?: string; whatsapp?: string }>({ studioName: "The Oyster Studios" });
  const [business, setBusiness] = useState<Business>(params.get("business") === "marketing" ? "marketing" : "photography");
  const [f, setF] = useState({ name: "", phone: "", email: "", eventDate: "", location: "", budget: "", message: "", website: "" });
  const [services, setServices] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string>();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF({ ...f, [k]: e.target.value });
    setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const copy = COPY[business];
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

  useEffect(() => {
    document.title = `Enquire · ${studio.studioName}`;
  }, [studio]);
  useEffect(() => {
    if (!IS_DEMO) fetch("/api/public/enquiry-info").then((r) => (r.ok ? r.json() : undefined)).then((x) => x && setStudio(x), () => {});
  }, []);

  const submit = async () => {
    setFailure(undefined);
    const phoneDigits = f.phone.replace(/\D/g, "");
    const next: Partial<Record<Field, string>> = {};
    if (f.name.trim().length < 2) next.name = "Add your name";
    if (!phoneDigits && !f.email.trim()) next.phone = "Add a phone number or an email so we can reply";
    if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 12)) next.phone = "Check the number — 10 digits";
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) next.email = "Check the email address";
    if (f.message.trim().length < 5) next.message = "Tell us a little about what you need";
    setErrors(next);
    if (Object.keys(next).length) return;
    setState("sending");
    try {
      if (!IS_DEMO) {
        const body = {
          name: f.name.trim(),
          business,
          message: f.message.trim(),
          website: f.website,
          ...(phoneDigits && { phone: phoneDigits.length === 10 ? `+91 ${phoneDigits}` : `+${phoneDigits}` }),
          ...(f.email.trim() && { email: f.email.trim() }),
          ...(services.length && { service: services.join(", ").slice(0, 120) }),
          ...(business === "photography" && f.eventDate && { eventDate: f.eventDate }),
          ...(f.location.trim() && { location: f.location.trim() }),
          ...(f.budget && { budget: f.budget }),
        };
        const res = await fetch("/api/public/enquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const out = (await res.json().catch(() => ({}))) as { error?: string; issues?: { message: string }[] };
        if (!res.ok) throw new Error(out.issues?.[0]?.message ?? out.error ?? "Please try again in a moment");
      }
      setState("sent");
    } catch (e) {
      setFailure((e as Error).message);
      setState("idle");
    }
  };

  const wa = studio.whatsapp?.replace(/\D/g, "");
  const contact = (
    <div className="flex flex-wrap gap-2">
      {wa && <Button asChild size="sm"><a href={`https://wa.me/${wa.length === 10 ? `91${wa}` : wa}`} target="_blank" rel="noreferrer"><MessageCircle strokeWidth={1.5} /> WhatsApp us</a></Button>}
      {studio.email && <Button asChild size="sm" variant="ghost"><a href={`mailto:${studio.email}`}><Mail strokeWidth={1.5} /> {studio.email}</a></Button>}
    </div>
  );

  if (state === "sent")
    return (
      <main className={cn("grid place-items-center bg-bg px-4", embedded ? "py-10" : "min-h-dvh py-16")}>
        <section className="flex max-w-[480px] flex-col items-center gap-4 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-ok-wash text-ok"><Check size={28} strokeWidth={2} /></span>
          <h1 className="t-title m-0">Thank you, {f.name.trim().split(" ")[0]}</h1>
          <p className="t-body m-0 text-ink-2">Your enquiry is with {studio.studioName}. Someone from the team will get back to you {f.phone.trim() ? "on WhatsApp or by phone" : "by email"} shortly.</p>
          {!embedded && <div className="mt-2">{contact}</div>}
        </section>
      </main>
    );

  return (
    <main className={cn("bg-bg", embedded ? "p-4" : "min-h-dvh px-4 py-8 md:py-14")}>
      <div className={cn("mx-auto grid gap-8", embedded ? "max-w-[640px]" : "max-w-[1080px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14")}>
        {!embedded && (
          <aside className="flex flex-col gap-6 lg:sticky lg:top-12 lg:self-start">
            <img src="/logo.png" alt={studio.studioName} className="h-20 w-auto self-start" />
            <div>
              <p className="t-eyebrow m-0 text-ink-3">Enquire</p>
              <h1 className="t-title m-0 mt-2">{copy.title}</h1>
              <p className="t-body m-0 mt-3 text-ink-2">{copy.lead}</p>
            </div>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              <Reason icon={<UserRound size={16} strokeWidth={1.5} />}>A real person from the team replies to every enquiry.</Reason>
              <Reason icon={<Sparkles size={16} strokeWidth={1.5} />}>No obligation — it starts with a conversation about what you want.</Reason>
              <Reason icon={<Lock size={16} strokeWidth={1.5} />}>Your details are used only to reply to you. <a href="/privacy" className="underline">Privacy policy</a></Reason>
            </ul>
            {(wa || studio.email) && (
              <div className="flex flex-col gap-2 border-t border-line pt-5">
                <p className="t-meta m-0 text-ink-3">Prefer to talk?</p>
                {contact}
              </div>
            )}
          </aside>
        )}

        <form
          noValidate
          className="flex flex-col gap-6 rounded-panel border border-line bg-surface p-5 shadow-rest md:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {embedded && <h1 className="t-sheet m-0">{copy.title}</h1>}
          <fieldset className="m-0 border-0 p-0">
            <legend className="t-dense mb-2 font-medium">What are you looking for?</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Choice on={business === "photography"} onPick={() => { setBusiness("photography"); setServices([]); setF({ ...f, budget: "" }); }} icon={<Camera size={20} strokeWidth={1.5} />} title="Wedding photography" body="Weddings, pre-wedding shoots, films and albums" />
              <Choice on={business === "marketing"} onPick={() => { setBusiness("marketing"); setServices([]); setF({ ...f, budget: "" }); }} icon={<Megaphone size={20} strokeWidth={1.5} />} title="Marketing" body="Social media, ads, branding and websites" />
            </div>
          </fieldset>

          <Section title="About you">
            <Labelled label="Your name" required error={errors.name}>
              <Input value={f.name} onChange={set("name")} autoComplete="name" aria-invalid={!!errors.name} placeholder={business === "photography" ? "Riya Sharma" : "Your full name"} />
            </Labelled>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Labelled label="Phone / WhatsApp" error={errors.phone}>
                <span className="flex items-center rounded-control bg-sunken focus-within:bg-surface focus-within:ring-1 focus-within:ring-line-2">
                  <span className="border-r border-line px-3 font-mono fs-13 text-ink-2">+91</span>
                  <input type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="tel-national" aria-invalid={!!errors.phone} placeholder="98765 43210" className="h-[38px] w-full min-w-0 bg-transparent px-3 t-dense text-ink outline-none placeholder:text-ink-3" />
                </span>
              </Labelled>
              <Labelled label="Email" error={errors.email}>
                <Input type="email" value={f.email} onChange={set("email")} autoComplete="email" aria-invalid={!!errors.email} placeholder="you@example.com" />
              </Labelled>
            </div>
            <p className="t-meta m-0 -mt-2 text-ink-3">A phone number or an email is enough.</p>
          </Section>

          <Section title={business === "photography" ? "Your celebration" : "Your project"}>
            <div>
              <p className="t-meta m-0 mb-2 text-ink-2">Services you're interested in <span className="text-ink-3">(choose any)</span></p>
              <div className="flex flex-wrap gap-2">
                {SERVICES[business].map((x) => {
                  const on = services.includes(x);
                  return (
                    <button
                      key={x}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setServices(on ? services.filter((y) => y !== x) : [...services, x])}
                      className={cn("flex items-center gap-1.5 rounded-chip border px-3 py-1.5 fs-13 transition-colors", on ? "border-ink bg-ink text-on-ink" : "border-line-2 bg-surface text-ink-2 hover:border-ink-3")}
                    >
                      {on && <Check size={13} strokeWidth={2} />} {x}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {business === "photography" && (
                <Labelled label="Wedding / event date">
                  <Input type="date" min={today} value={f.eventDate} onChange={set("eventDate")} />
                </Labelled>
              )}
              <Labelled label={business === "photography" ? "City or venue" : "City"}>
                <Input value={f.location} onChange={set("location")} placeholder={business === "photography" ? "Udaipur, or the venue name" : "Bengaluru"} />
              </Labelled>
              <Labelled label="Budget">
                <Select value={f.budget} onChange={set("budget")}>
                  <option value="">Choose a range</option>
                  {BUDGETS[business].map((b) => <option key={b}>{b}</option>)}
                </Select>
              </Labelled>
            </div>
            <Labelled label="Tell us more" required error={errors.message}>
              <Textarea rows={5} value={f.message} onChange={set("message")} aria-invalid={!!errors.message} placeholder={copy.message} />
            </Labelled>
          </Section>

          {/* Honeypot: hidden from people; bots fill it and their enquiry is dropped. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} className="absolute left-[-9999px] size-px opacity-0" aria-hidden="true" />

          {failure && <p role="alert" className="t-dense m-0 rounded-control bg-risk-wash px-3 py-2 text-risk">{failure}</p>}
          <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
            <p className="t-meta m-0 flex-1 text-ink-3">By sending this you agree to be contacted about your enquiry.</p>
            <Button type="submit" variant="ink" disabled={state === "sending"} className="h-11 px-6 fs-14">
              <Send strokeWidth={1.5} /> {state === "sending" ? "Sending…" : "Send enquiry"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Reason({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-ink-2">{icon}</span>
      <span className="t-dense pt-1.5 text-ink-2">{children}</span>
    </li>
  );
}

function Choice({ on, onPick, icon, title, body }: { on: boolean; onPick: () => void; icon: ReactNode; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn("flex items-start gap-3 rounded-card border p-4 text-left transition-colors", on ? "border-ink bg-sunken ring-1 ring-ink" : "border-line-2 hover:border-ink-3")}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", on ? "bg-ink text-on-ink" : "bg-sunken text-ink-2")}>{icon}</span>
      <span className="min-w-0">
        <span className="t-dense block font-medium">{title}</span>
        <span className="t-meta block text-ink-3">{body}</span>
      </span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="t-eyebrow m-0 text-ink-3">{title}</h2>
      {children}
    </section>
  );
}

function Labelled({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="t-meta text-ink-2">{label}{required && <span className="text-risk" aria-hidden> *</span>}</span>
      <span className={cn("block rounded-control", error && "ring-1 ring-risk")}>{children}</span>
      {error && <span role="alert" className="fs-12 text-risk">{error}</span>}
    </label>
  );
}
