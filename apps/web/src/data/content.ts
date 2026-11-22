import type { ContentStatus } from "@pinnacle/shared";
import { toast } from "@pinnacle/ui";
import { useEffect } from "react";
import { create } from "zustand";
import { api } from "../lib/api";
import { IS_DEMO } from "../lib/demo";

/** One post on a marketing client's content calendar. The table, calendar and kanban all read this one list. */
export type ContentItem = {
  id: string;
  companyId: string;
  title: string;
  person?: string;
  type: string;
  shootDate?: string;
  publishDate?: string;
  status: ContentStatus;
  driveUrl?: string;
  caption?: string;
  createdAt: string;
};

const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const DEMO: ContentItem[] = [
  ["Heart health tips", "Dr. Meera", "Reel", -4, -2, "published"],
  ["New facility tour", "Dr. Rajesh", "Video", 1, 3, "approval"],
  ["Post-surgery care", "Dr. Meera", "Carousel", -1, 6, "editing"],
  ["Monsoon health", "Dr. Rajesh", "Static post", undefined, 9, "planning"],
  ["Doctor interview", "Dr. Meera", "Reel", 4, 12, "shooting"],
  ["Navarathri carousel", undefined, "Carousel", undefined, 5, "ready"],
].map(([title, person, type, shoot, publish, status], i) => ({
  id: `ct-${i}`,
  companyId: "ora",
  title: title as string,
  person: person as string | undefined,
  type: type as string,
  shootDate: shoot === undefined ? undefined : day(shoot as number),
  publishDate: day(publish as number),
  status: status as ContentStatus,
  createdAt: new Date().toISOString(),
}));

export const useContent = create<{ items: ContentItem[]; loaded: boolean }>(() => ({ items: [], loaded: false }));

/** All content, loaded the first time a screen asks for it. */
export function useContentItems() {
  const items = useContent((s) => s.items);
  const loaded = useContent((s) => s.loaded);
  useEffect(() => {
    if (loaded) return;
    if (IS_DEMO) return void useContent.setState({ items: DEMO, loaded: true });
    api<ContentItem[]>("/content?limit=2000").then(
      (items) => useContent.setState({ items, loaded: true }),
      () => useContent.setState({ loaded: true }),
    );
  }, [loaded]);
  return items;
}

/** Adds a post; shows it straight away and swaps in the saved one. */
export async function addContent(item: Omit<ContentItem, "id" | "createdAt">) {
  const temp: ContentItem = { ...item, id: `tmp-${Date.now()}`, createdAt: new Date().toISOString() };
  useContent.setState((s) => ({ items: [...s.items, temp] }));
  if (IS_DEMO) return temp;
  try {
    const saved = await api<ContentItem>("/content", { method: "POST", body: item });
    useContent.setState((s) => ({ items: s.items.map((x) => (x.id === temp.id ? saved : x)) }));
    return saved;
  } catch (e) {
    useContent.setState((s) => ({ items: s.items.filter((x) => x.id !== temp.id) }));
    toast(`Couldn't add it — ${(e as Error).message}`);
  }
}

/** Changes a post everywhere at once; `undefined` clears a field. */
export function updateContent(id: string, patch: Partial<Omit<ContentItem, "id" | "companyId" | "createdAt">>) {
  const prev = useContent.getState().items;
  useContent.setState({ items: prev.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  if (IS_DEMO || id.startsWith("tmp-")) return;
  // Dates and the link clear with null; text fields clear to "".
  const nullable = new Set(["shootDate", "publishDate", "driveUrl"]);
  const body = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined || v === "" ? (nullable.has(k) ? null : "") : v]));
  api(`/content/${id}`, { method: "PATCH", body }).catch((e: Error) => {
    useContent.setState({ items: prev });
    toast(`Couldn't save — ${e.message}`);
  });
}

export function removeContent(id: string) {
  const prev = useContent.getState().items;
  useContent.setState({ items: prev.filter((x) => x.id !== id) });
  if (IS_DEMO) return;
  api(`/content/${id}`, { method: "DELETE" }).catch((e: Error) => {
    useContent.setState({ items: prev });
    toast(`Couldn't delete — ${e.message}`);
  });
}
