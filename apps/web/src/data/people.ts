import { toast } from "@pinnacle/ui";
import { useEffect } from "react";
import { create } from "zustand";
import { api } from "../lib/api";
import { IS_DEMO } from "../lib/demo";
import type { Freelancer } from "./types";

/** Freelancers and salaries: loaded when a screen needs them, not with everything else. */
type People = {
  freelancers: Freelancer[];
  salaries: Record<string, number>; // memberId → monthly paise (owners and Finance only)
  loaded: boolean;
};

const DEMO: Freelancer[] = [
  { id: "f-aniketh", name: "Aniketh", phone: "+91 98450 11223", skill: "Photographer", idType: "Aadhaar", idNumber: "•••• 9012", createdAt: "2026-06-01T10:00:00+05:30" },
  { id: "f-arun", name: "Arun", phone: "+91 99000 44556", skill: "Photographer", createdAt: "2026-06-01T10:00:00+05:30" },
  { id: "f-bobby", name: "Bobby", phone: "+91 97411 77889", skill: "Cinematographer", idType: "PAN", idNumber: "•••• 234F", createdAt: "2026-07-12T10:00:00+05:30" },
  { id: "f-teju", name: "Teju", phone: "+91 96111 22334", skill: "Cinematographer", createdAt: "2026-08-03T10:00:00+05:30" },
];

export const usePeople = create<People>(() => ({ freelancers: [], salaries: {}, loaded: false }));

export async function loadPeople(withSalaries: boolean) {
  if (IS_DEMO) return usePeople.setState({ freelancers: DEMO, salaries: { sr: 85_000_00, rv: 45_000_00, dp: 40_000_00, ak: 38_000_00 }, loaded: true });
  const [freelancers, salaries] = await Promise.all([
    api<Freelancer[]>("/freelancers").catch(() => []),
    withSalaries ? api<{ memberId: string; monthlyPaise: number }[]>("/salaries").catch(() => []) : Promise.resolve([]),
  ]);
  usePeople.setState({ freelancers, salaries: Object.fromEntries(salaries.map((x) => [x.memberId, x.monthlyPaise])), loaded: true });
}

export async function saveFreelancer(f: Partial<Freelancer> & { name: string }) {
  const body = Object.fromEntries(Object.entries(f).filter(([k]) => k !== "id" && k !== "createdAt").map(([k, v]) => [k, v === "" ? null : v]));
  try {
    const saved = IS_DEMO
      ? ({ ...f, id: f.id ?? `f-${Date.now()}`, createdAt: f.createdAt ?? new Date().toISOString() } as Freelancer)
      : f.id
        ? await api<Freelancer>(`/freelancers/${f.id}`, { method: "PATCH", body })
        : await api<Freelancer>("/freelancers", { method: "POST", body: Object.fromEntries(Object.entries(body).filter(([, v]) => v !== null)) });
    usePeople.setState((s) => ({ freelancers: f.id ? s.freelancers.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...s.freelancers] }));
    return saved;
  } catch (e) {
    toast(`Couldn't save — ${(e as Error).message}`);
  }
}

export async function setSalary(memberId: string, monthlyPaise: number) {
  const prev = usePeople.getState().salaries;
  usePeople.setState({ salaries: { ...prev, [memberId]: monthlyPaise } });
  if (IS_DEMO) return;
  await api(`/salaries/${memberId}`, { method: "PUT", body: { monthlyPaise } }).catch((e: Error) => {
    usePeople.setState({ salaries: prev });
    toast(`Couldn't save the salary — ${e.message}`);
  });
}

/** The freelancer list, loaded the first time a screen asks for it. */
export function useFreelancers() {
  const freelancers = usePeople((p) => p.freelancers);
  const loaded = usePeople((p) => p.loaded);
  useEffect(() => void (loaded || loadPeople(false)), [loaded]);
  return freelancers;
}
