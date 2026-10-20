import { parseRupees, BUSINESS_LABEL, BUSINESSES, type Business, type FinanceSettings, type Package, type PlanStep } from "@pinnacle/shared";
import { Button, Input, Segmented, Select, Textarea, toast } from "@pinnacle/ui";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAccess, useCrm } from "../../data/store";
import { api } from "../../lib/api";
import { IS_DEMO } from "../../lib/demo";
import { SettingsHeader } from "./layout";

const toPaise = (v: string) => parseRupees(v) ?? 0; // exact rupees ("58,950"); "2.5L", "75k" also work

/** The price list, payment plans and standard terms that new quotations start from. Owners and Finance edit. */
export function PackagesRoute() {
  const saved = useCrm((s) => s.finance);
  const canEdit = useAccess("finance") === "edit";
  const view = useCrm((s) => s.businessView);
  const [business, setBusiness] = useState<Business>(view === "all" ? "photography" : view);
  const [draft, setDraft] = useState<FinanceSettings>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const packages = draft.packages.filter((p) => p.business === business);
  const plan = draft.plans[business];
  const percent = plan.reduce((a, x) => a + x.percent, 0);
  const setPkg = (id: string, patch: Partial<Package>) => setDraft({ ...draft, packages: draft.packages.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const setPlan = (next: PlanStep[]) => setDraft({ ...draft, plans: { ...draft.plans, [business]: next } });

  return (
    <>
      <SettingsHeader title="Packages & payments" body="Your price list, how clients pay, and the terms printed on quotations. Prices are before GST. Changes apply to new quotations." />
      <Segmented label="Business" value={business} onChange={setBusiness} options={BUSINESSES.map((b) => ({ value: b, label: BUSINESS_LABEL[b] }))} className="mb-4" />
      {!canEdit && <p className="t-dense mb-4 rounded-card bg-sunken px-4 py-3 text-ink-2">Only owners and Finance can change packages and payment plans.</p>}

      <fieldset disabled={!canEdit} className="contents">
        <h2 className="t-eyebrow m-0 mb-1 text-ink-3">Packages · {packages.length}</h2>
        <ul className="m-0 list-none p-0">
          {packages.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2.5">
              <Input aria-label="Package name" value={p.name} onChange={(e) => setPkg(p.id, { name: e.target.value })} className="h-8 w-[200px]" />
              <Input aria-label="What's included" value={p.description ?? ""} placeholder="What's included" onChange={(e) => setPkg(p.id, { description: e.target.value || undefined })} className="h-8 min-w-0 flex-1 basis-[240px]" />
              <Input aria-label="Price in rupees" inputMode="decimal" value={p.pricePaise / 100} onChange={(e) => setPkg(p.id, { pricePaise: toPaise(e.target.value) })} className="h-8 w-28 text-right font-mono" />
              <Select aria-label="Kind" value={p.monthly ? "monthly" : p.addOn ? "addon" : "package"} onChange={(e) => setPkg(p.id, { monthly: e.target.value === "monthly" || undefined, addOn: e.target.value === "addon" || undefined })} className="w-[120px]">
                <option value="package">Package</option>
                <option value="addon">Add-on</option>
                <option value="monthly">Per month</option>
              </Select>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${p.name}`} onClick={() => setDraft({ ...draft, packages: draft.packages.filter((x) => x.id !== p.id) })}><Trash2 strokeWidth={1.5} /></Button>
            </li>
          ))}
        </ul>
        {canEdit && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setDraft({ ...draft, packages: [...draft.packages, { id: `p${Date.now().toString(36)}`, business, name: "New package", pricePaise: 0 }] })}>
            <Plus strokeWidth={1.5} /> Add package
          </Button>
        )}

        <h2 className="t-eyebrow m-0 mt-8 mb-1 text-ink-3">Payment plan · <span className={percent === 100 ? "" : "text-risk"}>{percent}%</span></h2>
        <ol className="m-0 list-none p-0">
          {plan.map((x, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 border-b border-line py-2.5">
              <Input aria-label="Stage" value={x.label} onChange={(e) => setPlan(plan.map((y, k) => (k === i ? { ...y, label: e.target.value } : y)))} className="h-8 min-w-0 flex-1 basis-[180px]" />
              <Input aria-label="Percent" inputMode="numeric" value={x.percent} onChange={(e) => setPlan(plan.map((y, k) => (k === i ? { ...y, percent: Math.min(100, Number(e.target.value.replace(/[^\d.]/g, "")) || 0) } : y)))} className="h-8 w-16 text-right font-mono" />
              <span className="font-mono text-[12px] text-ink-3">%, due</span>
              <Input aria-label="Days" inputMode="numeric" value={x.days} onChange={(e) => setPlan(plan.map((y, k) => (k === i ? { ...y, days: Number(e.target.value.replace(/[^\d-]/g, "")) || 0 } : y)))} className="h-8 w-16 text-right font-mono" />
              <Select aria-label="Counted from" value={x.from} onChange={(e) => setPlan(plan.map((y, k) => (k === i ? { ...y, from: e.target.value as PlanStep["from"] } : y)))} className="w-[190px]">
                <option value="confirmed">days from booking</option>
                <option value="event">days from the event</option>
              </Select>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${x.label}`} disabled={plan.length === 1} onClick={() => setPlan(plan.filter((_, k) => k !== i))}><Trash2 strokeWidth={1.5} /></Button>
            </li>
          ))}
        </ol>
        {canEdit && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setPlan([...plan, { label: "New stage", percent: 0, from: "confirmed", days: 30 }])}>
            <Plus strokeWidth={1.5} /> Add stage
          </Button>
        )}

        <h2 className="t-eyebrow m-0 mt-8 mb-2 text-ink-3">Standard terms</h2>
        <Textarea rows={6} value={draft.terms[business]} onChange={(e) => setDraft({ ...draft, terms: { ...draft.terms, [business]: e.target.value } })} />
      </fieldset>

      {canEdit && (
        <>
          {error && <p role="alert" className="t-meta mt-3 text-risk">{error}</p>}
          <div className="flex justify-end gap-2 pt-4">
            {dirty && <Button variant="ghost" onClick={() => { setDraft(saved); setError(undefined); }}>Discard</Button>}
            <Button
              variant="ink"
              disabled={!dirty || busy}
              onClick={async () => {
                if (BUSINESSES.some((b) => Math.abs(draft.plans[b].reduce((a, x) => a + x.percent, 0) - 100) > 0.01)) return setError("Each payment plan must add up to 100%.");
                if (draft.packages.some((p) => !p.name.trim())) return setError("Every package needs a name.");
                setBusy(true);
                try {
                  const next = IS_DEMO ? draft : await api<FinanceSettings>("/finance-settings", { method: "PUT", body: draft });
                  useCrm.setState({ finance: next });
                  setDraft(next);
                  setError(undefined);
                  toast("Saved · new quotations will use it");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
