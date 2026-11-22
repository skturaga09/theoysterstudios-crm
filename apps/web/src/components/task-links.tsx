import { embedOf } from "@pinnacle/shared";
import { Button, cn, Input, toast } from "@pinnacle/ui";
import { ExternalLink, Link2, Play, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCrm } from "../data/store";
import type { Task } from "../data/types";

/** Shows a link inside the CRM: a Drive / YouTube / Vimeo / Instagram player, an image or a video, full screen. */
export function LinkViewer({ url, label, onClose }: { url?: string; label?: string; onClose: () => void }) {
  const e = url ? embedOf(url) : undefined;
  useEffect(() => {
    if (!url) return;
    const key = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [url, onClose]);
  return createPortal(
    <AnimatePresence>
      {url && (
        <motion.div key="viewer" className="fixed inset-0 z-[90] flex flex-col bg-black/85 p-3 backdrop-blur-sm md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-modal aria-label={label ?? "Preview"}>
          <div className="mb-3 flex items-center gap-3 text-white" onClick={(ev) => ev.stopPropagation()}>
            <span className="min-w-0 flex-1 truncate fs-14 font-medium">{label}{e && e.source !== label && <span className="ml-2 fs-12 font-normal text-white/60">{e.source}</span>}</span>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 fs-12.5 hover:bg-white/25"><ExternalLink size={14} strokeWidth={1.5} /> Open in new tab</a>
            <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"><X size={18} strokeWidth={1.5} /></button>
          </div>
          <motion.div className="relative min-h-0 flex-1 overflow-hidden rounded-[14px] bg-black" initial={{ scale: 0.97 }} animate={{ scale: 1 }} onClick={(ev) => ev.stopPropagation()}>
            {!e ? (
              <div className="grid h-full place-items-center p-6 text-center text-white/80">
                <p className="m-0 max-w-[46ch] fs-14">This kind of link can't be shown inside the CRM. <a href={url} target="_blank" rel="noreferrer" className="text-white underline">Open it in a new tab</a>.</p>
              </div>
            ) : e.kind === "image" ? (
              <img src={e.src} alt={label ?? ""} className="h-full w-full object-contain" />
            ) : e.kind === "video" ? (
              <video src={e.src} controls autoPlay className="h-full w-full object-contain" />
            ) : (
              <iframe src={e.src} title={label ?? "Preview"} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen className="h-full w-full border-0 bg-white" />
            )}
          </motion.div>
          {e?.source.startsWith("Google") && <p className="m-0 mt-2 text-center fs-11.5 text-white/60">Not loading? The file has to be shared with your Google account, or as "Anyone with the link".</p>}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** A button that previews a link in the CRM. */
export function PreviewLink({ url, label, className }: { url: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Preview ${label}`} title="Preview" className={cn("grid size-7 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink", className)}>
        <Play size={13} strokeWidth={1.75} />
      </button>
      <LinkViewer url={open ? url : undefined} label={label} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * The work on a task: links to drafts and finals (Drive, YouTube…), each previewed inside the CRM. Adding a link to
 * an open task sends it for review, and the project's manager is told.
 */
export function TaskLinks({ t, canEdit, compact }: { t: Task; canEdit: boolean; compact?: boolean }) {
  const [draft, setDraft] = useState({ label: "", url: "" });
  const [view, setView] = useState<{ url: string; label: string }>();
  const links = t.links ?? [];
  const save = (next: { label: string; url: string }[]) => {
    const handIn = next.length > links.length && !t.done && t.status !== "review";
    useCrm.getState().updateTask(t.id, { links: next, ...(handIn && { status: "review" as const }) });
    if (handIn) toast("Link added · sent for review");
  };
  return (
    <div className="flex flex-col gap-1.5">
      {!compact && <span className="t-meta text-ink-3">Work links</span>}
      {links.map((l, i) => (
        <span key={i} className="flex items-center gap-1.5 rounded-control bg-surface px-1.5 py-1">
          <button type="button" onClick={() => setView(l)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-[8px]", embedOf(l.url) ? "bg-signal-wash text-signal" : "bg-sunken text-ink-3")}>{embedOf(l.url) ? <Play size={13} strokeWidth={1.75} /> : <Link2 size={13} strokeWidth={1.5} />}</span>
            <span className="min-w-0">
              <span className="t-dense block truncate font-medium hover:underline">{l.label}</span>
              <span className="block truncate fs-11 text-ink-3">{embedOf(l.url)?.source ?? new URL(l.url).hostname}</span>
            </span>
          </button>
          <a href={l.url} target="_blank" rel="noreferrer" aria-label={`Open ${l.label} in a new tab`} className="grid size-7 place-items-center text-ink-3 hover:text-ink"><ExternalLink size={13} strokeWidth={1.5} /></a>
          {canEdit && <Button size="icon-sm" variant="ghost" aria-label={`Remove ${l.label}`} onClick={() => save(links.filter((_, k) => k !== i))}><Trash2 strokeWidth={1.5} /></Button>}
        </span>
      ))}
      {!links.length && !canEdit && <span className="t-meta text-ink-3">No links yet.</span>}
      {canEdit && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const url = draft.url.trim();
            if (!/^https:\/\/\S+$/.test(url)) return toast("Paste a full link, starting https://");
            const label = draft.label.trim() || embedOf(url)?.source || new URL(url).hostname;
            save([...links, { label, url }]);
            setDraft({ label: "", url: "" });
          }}
        >
          <Input aria-label="Link" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="Paste the Drive / YouTube link of the draft or final" className="h-8 min-w-0 flex-1 basis-[220px]" />
          <Input aria-label="Name" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Name, e.g. Teaser v2" className="h-8 w-[150px]" />
          <Button type="submit" size="sm" disabled={!draft.url.trim()}>Add link</Button>
        </form>
      )}
      <LinkViewer url={view?.url} label={view?.label} onClose={() => setView(undefined)} />
    </div>
  );
}
