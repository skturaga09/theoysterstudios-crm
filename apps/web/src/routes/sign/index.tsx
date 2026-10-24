import { fmtDate, formatFull, invoiceTotals } from "@pinnacle/shared";
import { Button, Input, toast } from "@pinnacle/ui";
import { Check, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { Quote } from "../../data/types";
import { IS_DEMO } from "../../lib/demo";
import { AgreementDocument } from "../invoices/print";

type SignView = {
  studio: { name: string; legalName?: string; address?: string; email?: string; whatsapp?: string };
  client: { name: string; address?: string };
  deal?: { title: string; eventDate?: string };
  quote: Pick<Quote, "id" | "number" | "createdAt" | "validUntil" | "supply" | "lines" | "terms" | "schedule" | "status">;
  fingerprint: string;
  signature?: { name: string; at: string };
};

/** What the signing page shows in the demo build (no server). */
const SAMPLE: SignView = {
  studio: { name: "The Oyster Studios", legalName: "The Oyster Studios LLP", address: "Indiranagar, Bengaluru 560038", whatsapp: "+91 98765 43210" },
  client: { name: "Riya & Arjun", address: "Koramangala, Bengaluru" },
  deal: { title: "Riya & Arjun — Udaipur wedding", eventDate: "2026-12-12" },
  quote: {
    id: "demo",
    number: "TOS/Q/26-27/014",
    createdAt: "2026-10-18T10:00:00+05:30",
    validUntil: "2026-11-17",
    supply: "intra",
    lines: [{ desc: "Signature wedding — 2 days · candid + traditional photo & video · highlight + full film · album", sac: "998383", qty: 1, ratePaise: 3_00_000_00 }, { desc: "Drone coverage — per day", sac: "998383", qty: 2, ratePaise: 25_000_00 }],
    terms: "The booking is confirmed when the advance is received. The advance is non-refundable but can move to a new date once, subject to availability. Travel and stay outside the city are billed at actuals.",
    schedule: [
      { id: "m1", label: "Booking advance", amountPaise: 1_05_000_00, dueDate: "2026-10-20" },
      { id: "m2", label: "Before the wedding", amountPaise: 1_75_000_00, dueDate: "2026-12-05" },
      { id: "m3", label: "On delivery", amountPaise: 70_000_00, dueDate: "2027-01-26" },
    ],
    status: "sent",
  },
  fingerprint: "0".repeat(64),
};

/**
 * Online signing: the client reads the service agreement made from their quotation and accepts it with their typed
 * name and a consent tick. The server records who, when, from where, and a fingerprint of exactly what was shown.
 */
export function SignApp() {
  const token = window.location.pathname.split("/")[2] ?? "";
  const demo = IS_DEMO || token === "demo";
  const [view, setView] = useState<SignView | null>();
  const [form, setForm] = useState({ name: "", email: "", phone: "", agree: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = () => {
    if (demo) return setView(SAMPLE);
    fetch(`/api/public/sign/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? (r.json() as Promise<SignView>) : null))
      .then(setView, () => setView(null));
  };
  useEffect(load, [token, demo]);
  useEffect(() => {
    if (view) document.title = `Agreement ${view.quote.number} · ${view.studio.name}`;
  }, [view]);

  if (view === undefined) return <main className="min-h-dvh bg-bg" />;
  if (!view)
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-4">
        <div className="max-w-[420px] text-center">
          <img src="/logo.png" alt="" className="mx-auto mb-6 h-16 w-auto" />
          <h1 className="t-sheet m-0">This link isn't active</h1>
          <p className="t-body mt-2 text-ink-2">It may have been signed already, replaced or turned off. Ask the studio to send you a new one.</p>
        </div>
      </main>
    );

  const { quote } = view;
  const total = invoiceTotals({ ...quote, payments: [] }).total;
  const expired = quote.validUntil < new Date().toISOString().slice(0, 10);
  const signed = view.signature;

  const submit = async () => {
    setError(undefined);
    if (form.name.trim().length < 3) return setError("Type your full name.");
    if (!form.agree) return setError("Tick the box to agree.");
    setBusy(true);
    try {
      if (demo) {
        setView({ ...view, signature: { name: form.name.trim(), at: new Date().toISOString() } });
      } else {
        const res = await fetch(`/api/public/sign/${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: form.name.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, agree: true, fingerprint: view.fingerprint }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: { message: string }[]; signature?: { name: string; at: string } };
        if (!res.ok) throw new Error(body.issues?.[0]?.message ?? body.error ?? "Please try again");
        setView({ ...view, signature: body.signature });
      }
      toast("Signed — thank you! The studio has been told.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signedQuote = signed ? { ...quote, signature: { ...signed, ip: "", userAgent: "", fingerprint: view.fingerprint, method: "Online acceptance" } } : quote;

  return (
    <main className="min-h-dvh bg-sunken py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex w-[210mm] max-w-full flex-col gap-1 px-4 print:hidden">
        <h1 className="t-sheet m-0">{signed ? "Signed — thank you" : `Please review and sign: ${view.deal?.title ?? quote.number}`}</h1>
        <p className="t-meta m-0 text-ink-3">
          From {view.studio.name} · total {formatFull(total)} including GST · {signed ? `signed by ${signed.name} on ${fmtDate(signed.at)}` : `valid until ${fmtDate(quote.validUntil)}`}
        </p>
      </div>

      <AgreementDocument quote={signedQuote} studio={view.studio} client={view.client} deal={view.deal} />

      <section className="mx-auto mt-4 w-[210mm] max-w-full px-4 print:hidden">
        {signed ? (
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4">
            <Check size={18} strokeWidth={1.5} className="text-ok" />
            <p className="t-dense m-0 min-w-0 flex-1">Signed by <b>{signed.name}</b>. Keep a copy: print it or save it as a PDF.</p>
            <Button variant="ink" onClick={() => window.print()}><Printer strokeWidth={1.5} /> Print / Save as PDF</Button>
          </div>
        ) : expired ? (
          <p className="t-dense m-0 rounded-card border border-line bg-surface p-4 text-ink-2">This quotation expired on {fmtDate(quote.validUntil)}. Ask {view.studio.name} for an updated one.</p>
        ) : (
          <form
            className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h2 className="t-sheet m-0">Sign and accept</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="t-meta text-ink-2">Full name (your signature)</span>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="t-meta text-ink-2">Email (optional)</span>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="t-meta text-ink-2">Phone (optional)</span>
                <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
              </label>
            </div>
            <label className="t-dense flex items-start gap-2">
              <input type="checkbox" checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} className="mt-1 size-4 accent-[var(--ink)]" />
              <span>I have read this agreement and agree to its services, fees of {formatFull(total)} including GST, payment schedule and terms. Typing my name above is my signature.</span>
            </label>
            {form.name.trim() && <p className="m-0 fs-20 italic text-ink">{form.name.trim()}</p>}
            {error && <p role="alert" className="t-meta m-0 text-risk">{error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <p className="t-meta m-0 min-w-0 flex-1 text-ink-3">We record your name, the time, your IP address and device, and a fingerprint of this exact document, as proof of acceptance.</p>
              <Button type="submit" variant="ink" disabled={busy}>{busy ? "Signing…" : "Sign and accept"}</Button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
