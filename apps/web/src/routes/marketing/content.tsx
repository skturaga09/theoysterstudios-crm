import { CONTENT_STATUS_LABEL, CONTENT_STATUSES, CONTENT_TYPES, fmtDate, istDay, type ContentStatus } from "@pinnacle/shared";
import { Button, cn, Input, Segmented, Select, Sheet, Textarea, toast } from "@pinnacle/ui";
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, ExternalLink, Pencil, Plus, Search, Table2, Trash2 } from "lucide-react";
import { useState } from "react";
import { addContent, removeContent, updateContent, useContentItems, type ContentItem } from "../../data/content";
import { usePref } from "../../lib/hooks";

/** Each status's colour, used by the table, calendar and kanban alike. */
export const STATUS_STYLE: Record<ContentStatus, string> = {
  planning: "bg-sunken text-ink-2",
  shooting: "bg-signal-wash text-signal",
  editing: "bg-warn-wash text-warn",
  approval: "bg-[color-mix(in_srgb,#7c3aed_14%,transparent)] text-[#7c3aed]",
  ready: "bg-ok-wash text-ok",
  published: "bg-ok text-white",
};
const url = /^https?:\/\/\S+$/;

/**
 * A client's content calendar: the same posts as an editable table, a month calendar by publish date, and a kanban
 * by status. Every view writes to the one list, so a change in one shows in the others straight away.
 */
export function ContentCalendar({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const all = useContentItems();
  const [view, setView] = usePref<"table" | "calendar" | "kanban">("content.view", "table");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string>();
  const q = query.trim().toLowerCase();
  const items = all
    .filter((c) => c.companyId === companyId)
    .filter((c) => !q || [c.title, c.person, c.caption, c.type].some((x) => x?.toLowerCase().includes(q)))
    .sort((a, b) => (a.publishDate ?? "9999").localeCompare(b.publishDate ?? "9999"));
  const open = all.find((c) => c.id === openId);
  const add = async (patch: Partial<ContentItem> = {}) => {
    const saved = await addContent({ companyId, title: "New post", type: "Reel", status: "planning", ...patch });
    if (saved && view !== "table") setOpenId(saved.id);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canEdit && <Button variant="ink" size="sm" onClick={() => void add()}><Plus strokeWidth={1.5} /> New post</Button>}
        <label className="relative w-full max-w-[240px]">
          <Search size={14} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <Input aria-label="Search content" placeholder="Search content" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8" />
        </label>
        <span className="t-meta text-ink-3">{items.length} {items.length === 1 ? "post" : "posts"}</span>
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          className="ml-auto"
          options={[
            { value: "table", label: <><Table2 strokeWidth={1.5} />Table</> },
            { value: "calendar", label: <><CalendarDays strokeWidth={1.5} />Calendar</> },
            { value: "kanban", label: <><Columns3 strokeWidth={1.5} />Kanban</> },
          ]}
        />
      </div>

      {view === "table" ? (
        <ContentTable items={items} canEdit={canEdit} onOpen={setOpenId} onAdd={() => void add()} />
      ) : view === "calendar" ? (
        <ContentMonth items={items} onOpen={setOpenId} onAdd={canEdit ? (d) => void add({ publishDate: d }) : undefined} />
      ) : (
        <ContentKanban items={items} canEdit={canEdit} onOpen={setOpenId} />
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(undefined)} eyebrow={open ? `${open.type} · ${CONTENT_STATUS_LABEL[open.status]}` : ""} title={open?.title ?? ""}>
        {open && <ContentForm key={open.id} item={open} canEdit={canEdit} onDeleted={() => setOpenId(undefined)} />}
      </Sheet>
    </div>
  );
}

/* ---------- Table: edit in place, like a spreadsheet ---------- */

function ContentTable({ items, canEdit, onOpen, onAdd }: { items: ContentItem[]; canEdit: boolean; onOpen: (id: string) => void; onAdd: () => void }) {
  const head = "px-2 py-2 text-left font-mono fs-10.5 font-normal tracking-wide text-ink-3 uppercase whitespace-nowrap";
  const cell = "h-8 w-full rounded-control border border-transparent bg-transparent px-2 fs-12.5 hover:border-line focus:border-line-2 focus:bg-surface focus:outline-none disabled:hover:border-transparent";
  // Text cells save when you leave them, so typing stays smooth.
  const text = (c: ContentItem, key: "title" | "person" | "caption", placeholder: string) => (
    <input key={`${c.id}-${key}-${c[key] ?? ""}`} aria-label={`${key} of ${c.title}`} disabled={!canEdit} defaultValue={c[key] ?? ""} placeholder={placeholder} className={cell} onBlur={(e) => {
      const v = e.target.value.trim();
      if (key === "title" && !v) return void (e.target.value = c.title);
      if (v !== (c[key] ?? "")) updateContent(c.id, { [key]: v || undefined });
    }} />
  );
  return (
    <div className="overflow-x-auto rounded-[16px] border border-line bg-surface">
      <table className="w-full min-w-[1320px] border-collapse">
        <thead className="border-b border-line bg-sunken/50">
          <tr>
            <th className={cn(head, "min-w-[240px]")}>Content title</th>
            <th className={cn(head, "min-w-[130px]")}>Doctor / person</th>
            <th className={head}>Type</th>
            <th className={head}>Shoot date</th>
            <th className={head}>Publish date</th>
            <th className={head}>Status</th>
            <th className={head}>Drive link</th>
            <th className={cn(head, "min-w-[200px]")}>Caption</th>
            <th className={head}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b border-line last:border-0 hover:bg-hover/50">
              <td className="px-1 py-1">{text(c, "title", "Title")}</td>
              <td className="px-1 py-1">{text(c, "person", "—")}</td>
              <td className="px-1 py-1">
                <select aria-label={`Type of ${c.title}`} disabled={!canEdit} value={c.type} onChange={(e) => updateContent(c.id, { type: e.target.value })} className={cn(cell, "w-[120px]")}>
                  {CONTENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </td>
              <td className="px-1 py-1"><input type="date" aria-label={`Shoot date of ${c.title}`} disabled={!canEdit} value={c.shootDate ?? ""} onChange={(e) => updateContent(c.id, { shootDate: e.target.value || undefined })} className={cn(cell, "w-[140px] font-mono")} /></td>
              <td className="px-1 py-1"><input type="date" aria-label={`Publish date of ${c.title}`} disabled={!canEdit} value={c.publishDate ?? ""} onChange={(e) => updateContent(c.id, { publishDate: e.target.value || undefined })} className={cn(cell, "w-[140px] font-mono")} /></td>
              <td className="px-1 py-1">
                <select aria-label={`Status of ${c.title}`} disabled={!canEdit} value={c.status} onChange={(e) => updateContent(c.id, { status: e.target.value as ContentStatus })} className={cn("h-7 w-[150px] cursor-pointer rounded-full border-0 px-3 fs-12 font-medium", STATUS_STYLE[c.status])}>
                  {CONTENT_STATUSES.map((st) => <option key={st} value={st}>{CONTENT_STATUS_LABEL[st]}</option>)}
                </select>
              </td>
              <td className="px-1 py-1">
                <span className="flex items-center">
                  <input key={`${c.id}-d-${c.driveUrl ?? ""}`} aria-label={`Drive link of ${c.title}`} disabled={!canEdit} defaultValue={c.driveUrl ?? ""} placeholder="Paste link" className={cn(cell, "w-[130px]")} onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === (c.driveUrl ?? "")) return;
                    if (v && !url.test(v)) return toast("Paste a full link, starting https://");
                    updateContent(c.id, { driveUrl: v || undefined });
                  }} />
                  {c.driveUrl && <a href={c.driveUrl} target="_blank" rel="noreferrer" aria-label="Open the material" className="grid size-7 shrink-0 place-items-center text-ink-3 hover:text-ink"><ExternalLink size={13} strokeWidth={1.5} /></a>}
                </span>
              </td>
              <td className="px-1 py-1">{text(c, "caption", "Caption…")}</td>
              <td className="px-1 py-1 whitespace-nowrap">
                <Button size="icon-sm" variant="ghost" aria-label={`Open ${c.title}`} onClick={() => onOpen(c.id)}><Pencil strokeWidth={1.5} /></Button>
                {canEdit && <Button size="icon-sm" variant="ghost" aria-label={`Delete ${c.title}`} onClick={() => window.confirm(`Delete “${c.title}”? This can't be undone.`) && removeContent(c.id)}><Trash2 strokeWidth={1.5} /></Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <button onClick={onAdd} className="flex w-full items-center gap-2 px-4 py-2.5 text-left fs-12.5 text-ink-3 hover:bg-hover hover:text-ink">
          <Plus size={14} strokeWidth={1.5} /> New item
        </button>
      )}
      {!items.length && !canEdit && <p className="t-meta px-4 py-6 text-ink-3">No content planned yet.</p>}
    </div>
  );
}

/* ---------- Calendar: a month by publish date ---------- */

function ContentMonth({ items, onOpen, onAdd }: { items: ContentItem[]; onOpen: (id: string) => void; onAdd?: (day: string) => void }) {
  const today = istDay(new Date().toISOString());
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = new Date(`${month}-01T12:00:00Z`);
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7)); // weeks start on Monday
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 86400_000).toISOString().slice(0, 10));
  const shift = (n: number) => {
    const d = new Date(first);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const undated = items.filter((c) => !c.publishDate);
  return (
    <div className="rounded-[16px] border border-line bg-surface p-3">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="t-sheet m-0 flex-1">{first.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h3>
        <Button size="sm" variant="ghost" onClick={() => setMonth(today.slice(0, 7))}>Today</Button>
        <Button size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft strokeWidth={1.5} /></Button>
        <Button size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => shift(1)}><ChevronRight strokeWidth={1.5} /></Button>
      </div>
      <div className="grid grid-cols-7 border-t border-l border-line">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="border-r border-b border-line px-2 py-1 font-mono fs-10.5 text-ink-3 uppercase">{d}</div>)}
        {days.map((d) => {
          const list = items.filter((c) => c.publishDate === d);
          return (
            <div key={d} className={cn("group flex min-h-[96px] flex-col gap-1 border-r border-b border-line p-1", !d.startsWith(month) && "bg-sunken/60")}>
              <span className="flex items-center">
                <span className={cn("grid size-6 place-items-center rounded-full font-mono fs-11", d === today ? "bg-signal text-white" : d.startsWith(month) ? "text-ink-2" : "text-ink-3")}>{Number(d.slice(8))}</span>
                {onAdd && <button aria-label={`New post on ${fmtDate(d)}`} onClick={() => onAdd(d)} className="ml-auto hidden size-5 place-items-center rounded text-ink-3 group-hover:grid hover:bg-hover hover:text-ink"><Plus size={12} strokeWidth={1.5} /></button>}
              </span>
              {list.map((c) => (
                <button key={c.id} onClick={() => onOpen(c.id)} title={`${c.title} · ${CONTENT_STATUS_LABEL[c.status]}`} className={cn("truncate rounded-[6px] px-1.5 py-0.5 text-left fs-11 font-medium", STATUS_STYLE[c.status])}>
                  {c.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {undated.length > 0 && (
        <p className="t-meta m-0 mt-3 flex flex-wrap items-center gap-1.5 text-ink-3">
          No publish date yet:
          {undated.map((c) => <button key={c.id} onClick={() => onOpen(c.id)} className={cn("rounded-full px-2 py-0.5 fs-11", STATUS_STYLE[c.status])}>{c.title}</button>)}
        </p>
      )}
    </div>
  );
}

/* ---------- Kanban: drag a post to change its status ---------- */

function ContentKanban({ items, canEdit, onOpen }: { items: ContentItem[]; canEdit: boolean; onOpen: (id: string) => void }) {
  const [over, setOver] = useState<ContentStatus>();
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      {CONTENT_STATUSES.map((st) => {
        const list = items.filter((c) => c.status === st);
        return (
          <section
            key={st}
            aria-label={`${CONTENT_STATUS_LABEL[st]}: ${list.length}`}
            onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setOver(st); }}
            onDragLeave={() => setOver(undefined)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(undefined);
              const id = e.dataTransfer.getData("text/plain");
              if (id && items.find((c) => c.id === id)?.status !== st) {
                updateContent(id, { status: st });
                toast(`Moved to ${CONTENT_STATUS_LABEL[st]}`);
              }
            }}
            className={cn("flex min-h-[320px] w-[220px] shrink-0 flex-col gap-2 rounded-[16px] bg-sunken p-2 transition-shadow md:w-auto md:flex-1", over === st && "shadow-[inset_0_0_0_1.5px_var(--signal)]")}
          >
            <header className="flex items-center gap-2 px-1.5 pt-1 pb-1">
              <span className={cn("rounded-full px-2 py-0.5 fs-11.5 font-medium", STATUS_STYLE[st])}>{CONTENT_STATUS_LABEL[st]}</span>
              <span className="font-mono fs-11 text-ink-3">{list.length}</span>
            </header>
            {list.map((c) => (
              <button
                key={c.id}
                draggable={canEdit}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                onClick={() => onOpen(c.id)}
                className={cn("rounded-[12px] bg-surface p-2.5 text-left shadow-rest transition-shadow hover:shadow-pop", canEdit && "cursor-grab active:cursor-grabbing")}
              >
                <span className="t-dense block font-medium">{c.title}</span>
                <span className="mt-1 block fs-11 text-ink-3">{[c.type, c.person, c.publishDate && fmtDate(c.publishDate)].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
            {!list.length && <p className="m-0 rounded-[12px] border border-dashed border-line-2 px-2 py-4 text-center fs-11.5 text-ink-3">{canEdit ? "Drop here" : "Nothing"}</p>}
          </section>
        );
      })}
    </div>
  );
}

/* ---------- One post, every field ---------- */

function ContentForm({ item: c, canEdit, onDeleted }: { item: ContentItem; canEdit: boolean; onDeleted: () => void }) {
  const field = "flex flex-col gap-1";
  const lab = "t-meta text-ink-3";
  return (
    <fieldset disabled={!canEdit} className="m-0 flex flex-col gap-4 border-0 p-0">
      <label className={field}><span className={lab}>Content title</span>
        <Input defaultValue={c.title} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.title && updateContent(c.id, { title: e.target.value.trim() })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={field}><span className={lab}>Doctor / person</span>
          <Input defaultValue={c.person ?? ""} onBlur={(e) => e.target.value.trim() !== (c.person ?? "") && updateContent(c.id, { person: e.target.value.trim() || undefined })} />
        </label>
        <label className={field}><span className={lab}>Content type</span>
          <Select value={c.type} onChange={(e) => updateContent(c.id, { type: e.target.value })}>{CONTENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
        </label>
        <label className={field}><span className={lab}>Shoot date</span>
          <Input type="date" value={c.shootDate ?? ""} onChange={(e) => updateContent(c.id, { shootDate: e.target.value || undefined })} />
        </label>
        <label className={field}><span className={lab}>Publish date</span>
          <Input type="date" value={c.publishDate ?? ""} onChange={(e) => updateContent(c.id, { publishDate: e.target.value || undefined })} />
        </label>
      </div>
      <label className={field}><span className={lab}>Status</span>
        <Select value={c.status} onChange={(e) => updateContent(c.id, { status: e.target.value as ContentStatus })}>{CONTENT_STATUSES.map((st) => <option key={st} value={st}>{CONTENT_STATUS_LABEL[st]}</option>)}</Select>
      </label>
      <label className={field}><span className={lab}>Material / Google Drive link</span>
        <span className="flex gap-2">
          <Input defaultValue={c.driveUrl ?? ""} placeholder="https://drive.google.com/…" onBlur={(e) => {
            const v = e.target.value.trim();
            if (v === (c.driveUrl ?? "")) return;
            if (v && !url.test(v)) return toast("Paste a full link, starting https://");
            updateContent(c.id, { driveUrl: v || undefined });
          }} />
          {c.driveUrl && <Button asChild size="icon-sm" variant="ghost"><a href={c.driveUrl} target="_blank" rel="noreferrer" aria-label="Open the material"><ExternalLink strokeWidth={1.5} /></a></Button>}
        </span>
      </label>
      <label className={field}><span className={lab}>Caption / content text</span>
        <Textarea rows={6} defaultValue={c.caption ?? ""} onBlur={(e) => e.target.value.trim() !== (c.caption ?? "") && updateContent(c.id, { caption: e.target.value.trim() || undefined })} />
      </label>
      {canEdit && (
        <Button variant="ghost" className="self-start text-risk" onClick={() => {
          if (!window.confirm(`Delete “${c.title}”? This can't be undone.`)) return;
          removeContent(c.id);
          onDeleted();
        }}>
          <Trash2 strokeWidth={1.5} /> Delete post
        </Button>
      )}
    </fieldset>
  );
}
