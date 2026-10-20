import { BUSINESS_LABEL, BUSINESSES, PRIORITIES, PRIORITY_LABEL, type Business, type Priority, type ProjectTemplate, type Templates } from "@pinnacle/shared";
import { Button, Input, Segmented, Select, toast } from "@pinnacle/ui";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useCrm, useMe } from "../../data/store";
import { api } from "../../lib/api";
import { IS_DEMO } from "../../lib/demo";
import { SettingsHeader } from "./layout";

type Item = ProjectTemplate["tasks"][number];
const swap = <T,>(list: T[], i: number, j: number) => {
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
};

/** The checklist and deliverables every new project starts with, per business. Changes apply to new projects only. */
export function TemplatesRoute() {
  const saved = useCrm((s) => s.templates);
  const canEdit = useMe().role === "admin";
  const view = useCrm((s) => s.businessView);
  const [business, setBusiness] = useState<Business>(view === "all" ? "photography" : view);
  const [draft, setDraft] = useState<Templates>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const t = draft[business];
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const put = (next: Partial<ProjectTemplate>) => {
    setDraft({ ...draft, [business]: { ...t, ...next } });
    setError(undefined);
  };
  const setTask = (i: number, patch: Partial<Item>) => put({ tasks: t.tasks.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const days = (v: string) => Math.max(-365, Math.min(365, Number(v.replace(/[^\d-]/g, "")) || 0));
  const fromLabel = business === "photography" ? "event" : "confirmed";

  return (
    <>
      <SettingsHeader
        title="Project templates"
        body="When a lead is confirmed, its project starts with this checklist and these deliverables. Days count from the event date (or the confirmation day when there's no event date). Changes apply to new projects."
      />
      <Segmented label="Business" value={business} onChange={setBusiness} options={BUSINESSES.map((b) => ({ value: b, label: BUSINESS_LABEL[b] }))} className="mb-4" />
      {!canEdit && <p className="t-dense mb-4 rounded-card bg-sunken px-4 py-3 text-ink-2">Only admins can change the templates.</p>}

      <h2 className="t-eyebrow m-0 mb-1 text-ink-3">Checklist · {t.tasks.length}</h2>
      <ol className="m-0 list-none p-0">
        {t.tasks.map((x, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 border-b border-line py-2.5">
            <Input aria-label="Task" value={x.title} disabled={!canEdit} onChange={(e) => setTask(i, { title: e.target.value })} className="h-8 min-w-0 flex-1 basis-[220px]" />
            <label className="flex items-center gap-1.5">
              <span className="sr-only">Days</span>
              <Input inputMode="numeric" value={x.days} disabled={!canEdit} onChange={(e) => setTask(i, { days: days(e.target.value) })} className="h-8 w-14 text-right font-mono" />
            </label>
            <Select aria-label="Counted from" value={x.from} disabled={!canEdit} onChange={(e) => setTask(i, { from: e.target.value as Item["from"] })} className="w-[150px]">
              <option value="event">from event</option>
              <option value="confirmed">from confirmed</option>
            </Select>
            <Select aria-label="Priority" value={x.priority} disabled={!canEdit} onChange={(e) => setTask(i, { priority: e.target.value as Priority })} className="w-[100px]">
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </Select>
            <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
              <input type="checkbox" checked={!!x.approval} disabled={!canEdit} onChange={(e) => setTask(i, { approval: e.target.checked })} />
              Client approval
            </label>
            {canEdit && (
              <span className="ml-auto flex">
                <Button size="icon-sm" variant="ghost" aria-label={`Move ${x.title} up`} disabled={i === 0} onClick={() => put({ tasks: swap(t.tasks, i, i - 1) })}><ArrowUp strokeWidth={1.5} /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Move ${x.title} down`} disabled={i === t.tasks.length - 1} onClick={() => put({ tasks: swap(t.tasks, i, i + 1) })}><ArrowDown strokeWidth={1.5} /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Remove ${x.title}`} onClick={() => put({ tasks: t.tasks.filter((_, k) => k !== i) })}><Trash2 strokeWidth={1.5} /></Button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {canEdit && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => put({ tasks: [...t.tasks, { title: "New task", from: fromLabel, days: 0, priority: "normal" }] })}>
          <Plus strokeWidth={1.5} /> Add task
        </Button>
      )}

      <h2 className="t-eyebrow m-0 mt-8 mb-1 text-ink-3">Deliverables · {t.deliverables.length}</h2>
      <ol className="m-0 list-none p-0">
        {t.deliverables.map((x, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 border-b border-line py-2.5">
            <Input aria-label="Deliverable" value={x.name} disabled={!canEdit} onChange={(e) => put({ deliverables: t.deliverables.map((d, k) => (k === i ? { ...d, name: e.target.value } : d)) })} className="h-8 min-w-0 flex-1 basis-[220px]" />
            <Input aria-label="Days" inputMode="numeric" value={x.days} disabled={!canEdit} onChange={(e) => put({ deliverables: t.deliverables.map((d, k) => (k === i ? { ...d, days: days(e.target.value) } : d)) })} className="h-8 w-14 text-right font-mono" />
            <Select aria-label="Counted from" value={x.from} disabled={!canEdit} onChange={(e) => put({ deliverables: t.deliverables.map((d, k) => (k === i ? { ...d, from: e.target.value as Item["from"] } : d)) })} className="w-[150px]">
              <option value="event">from event</option>
              <option value="confirmed">from confirmed</option>
            </Select>
            {canEdit && <Button size="icon-sm" variant="ghost" aria-label={`Remove ${x.name}`} className="ml-auto" onClick={() => put({ deliverables: t.deliverables.filter((_, k) => k !== i) })}><Trash2 strokeWidth={1.5} /></Button>}
          </li>
        ))}
      </ol>
      {canEdit && (
        <>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => put({ deliverables: [...t.deliverables, { name: "New deliverable", from: fromLabel, days: 0 }] })}>
            <Plus strokeWidth={1.5} /> Add deliverable
          </Button>
          {error && <p role="alert" className="t-meta mt-3 text-risk">{error}</p>}
          <div className="flex justify-end gap-2 pt-4">
            {dirty && <Button variant="ghost" onClick={() => { setDraft(saved); setError(undefined); }}>Discard</Button>}
            <Button
              variant="ink"
              disabled={!dirty || busy}
              onClick={async () => {
                if (Object.values(draft).some((x) => x.tasks.some((y) => !y.title.trim()) || x.deliverables.some((y) => !y.name.trim()))) return setError("Every task and deliverable needs a name.");
                setBusy(true);
                try {
                  const next = IS_DEMO ? draft : await api<Templates>("/project-templates", { method: "PUT", body: draft });
                  useCrm.setState({ templates: next });
                  setDraft(next);
                  toast("Templates saved · new projects will use them");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Save templates"}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
