import { BUSINESS_LABEL, BUSINESSES, SERVICES, type Business } from "@pinnacle/shared";
import { Button, Input, Segmented, Textarea } from "@pinnacle/ui";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { IS_DEMO } from "../lib/demo";

/**
 * The public enquiry form (/enquire, no sign-in): link it from the website's Contact button or embed it. Each
 * enquiry arrives in Inbox as a routed lead within a minute. `?business=photography|marketing` preselects one.
 */
export function EnquirePage() {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get("business");
  const embedded = params.has("embed");
  const [studio, setStudio] = useState<{ studioName: string; email?: string; whatsapp?: string }>({ studioName: "The Oyster Studios" });
  const [business, setBusiness] = useState<Business>(preset === "marketing" ? "marketing" : "photography");
  const [f, setF] = useState({ name: "", phone: "", email: "", service: "", eventDate: "", location: "", budget: "", message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string>();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    document.title = "Enquire";
    if (!IS_DEMO) fetch("/api/public/enquiry-info").then((r) => (r.ok ? r.json() : undefined)).then((x) => x && setStudio(x), () => {});
  }, []);

  const submit = async () => {
    setError(undefined);
    if (f.name.trim().length < 2) return setError("Please add your name.");
    if (!f.phone.trim() && !f.email.trim()) return setError("Please leave a phone number or an email so we can reply.");
    if (f.message.trim().length < 5) return setError("Tell us a little about what you need.");
    setState("sending");
    try {
      if (!IS_DEMO) {
        const body = Object.fromEntries(Object.entries({ ...f, business }).filter(([k, v]) => k === "website" || String(v).trim()).map(([k, v]) => [k, String(v).trim()]));
        const res = await fetch("/api/public/enquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const out = (await res.json().catch(() => ({}))) as { error?: string; issues?: { message: string }[] };
        if (!res.ok) throw new Error(out.issues?.[0]?.message ?? out.error ?? "Please try again");
      }
      setState("sent");
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
    }
  };

  return (
    <main className={embedded ? "bg-bg p-4" : "min-h-dvh bg-bg px-4 py-10"}>
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        {!embedded && <img src="/logo.png" alt={studio.studioName} className="h-16 w-auto self-start" />}
        {state === "sent" ? (
          <section className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-6">
            <Check size={22} strokeWidth={1.5} className="text-ok" />
            <h1 className="t-sheet m-0">Thank you — we've got it</h1>
            <p className="t-body m-0 text-ink-2">Someone from {studio.studioName} will get back to you shortly{f.phone.trim() ? " on WhatsApp or a call" : " by email"}.</p>
          </section>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h1 className="t-title m-0">Tell us about your plans</h1>
            <Segmented label="What are you looking for" value={business} onChange={(b) => setBusiness(b)} options={BUSINESSES.map((b) => ({ value: b, label: BUSINESS_LABEL[b] }))} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1"><span className="t-meta text-ink-2">Your name</span><Input value={f.name} onChange={set("name")} autoComplete="name" /></label>
              <label className="flex flex-col gap-1"><span className="t-meta text-ink-2">Phone / WhatsApp</span><Input type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" placeholder="+91" /></label>
              <label className="flex flex-col gap-1 sm:col-span-2"><span className="t-meta text-ink-2">Email</span><Input type="email" value={f.email} onChange={set("email")} autoComplete="email" /></label>
              <label className="flex flex-col gap-1"><span className="t-meta text-ink-2">Service</span>
                <Input list="enquire-services" value={f.service} onChange={set("service")} placeholder={business === "photography" ? "Wedding photography" : "Social media management"} />
                <datalist id="enquire-services">{SERVICES[business].map((x) => <option key={x} value={x} />)}</datalist>
              </label>
              {business === "photography" ? (
                <label className="flex flex-col gap-1"><span className="t-meta text-ink-2">Wedding / event date</span><Input type="date" value={f.eventDate} onChange={set("eventDate")} /></label>
              ) : (
                <label className="flex flex-col gap-1"><span className="t-meta text-ink-2">City</span><Input value={f.location} onChange={set("location")} placeholder="Optional" /></label>
              )}
              {business === "photography" && <label className="flex flex-col gap-1"><span className="t-meta text-ink-2">City / venue</span><Input value={f.location} onChange={set("location")} /></label>}
              <label className="flex flex-col gap-1"><span className="t-meta text-ink-2">Budget (optional)</span><Input value={f.budget} onChange={set("budget")} placeholder="e.g. ₹2,50,000" /></label>
            </div>
            <label className="flex flex-col gap-1"><span className="t-meta text-ink-2">What do you need?</span><Textarea rows={4} value={f.message} onChange={set("message")} placeholder={business === "photography" ? "Functions, number of days, what you'd love captured…" : "Goals, platforms, timelines…"} /></label>
            {/* Honeypot: hidden from people; bots fill it and their enquiry is dropped. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} className="absolute left-[-9999px] size-px opacity-0" aria-hidden="true" />
            {error && <p role="alert" className="t-meta m-0 text-risk">{error}</p>}
            <Button type="submit" variant="ink" disabled={state === "sending"} className="self-start">{state === "sending" ? "Sending…" : "Send enquiry"}</Button>
            <p className="t-meta m-0 text-ink-3">We use your details only to reply to this enquiry. <a href="/privacy" className="underline">Privacy policy</a></p>
          </form>
        )}
      </div>
    </main>
  );
}
