/**
 * Demo build only: a few believable sample leads trickle in while the app is open, exercising the
 * feed flash, nav count and Lead Flow burst. Real leads will arrive from the channel integrations.
 */
import { lakh } from "@pinnacle/shared";
import { useEffect } from "react";
import { useCrm } from "./store";
import { IS_DEMO } from "../lib/demo";
import type { Conversation } from "./types";

type Seed = Omit<Conversation, "lastMessageAt" | "messages" | "id"> & { body: string };
const POOL: Seed[] = [
  {
    channel: "instagram", name: "Aarav Sinha", handle: "@aarav.brews", city: "Bengaluru", company: "Third Wave Roasters", unread: true,
    extracted: { intent: "quote", service: "Café rebrand + menu design", estValuePaise: lakh(5.5), city: "Bengaluru", suggestedOwnerId: "sr", confidence: 0.71 },
    body: "Hey! We're opening our 3rd café in Indiranagar and want to rebrand before that. Menus, signage, cups. Can you share a ballpark?",
  },
  {
    channel: "web", name: "Divya Menon", handle: "divya@kalaweaves.in", city: "Kochi", company: "Kala Weaves", unread: true,
    extracted: { intent: "quote", service: "Lookbook shoot", estValuePaise: lakh(3.2), city: "Kochi", suggestedOwnerId: "ak", confidence: 0.66 },
    body: "Website form · Service: Photography\nBudget: ₹3 lakh\nMessage: Handloom saree label, need a festive lookbook shoot (40 looks) in November.",
  },
  {
    channel: "whatsapp", name: "Karan Gill", handle: "+91 98140 22671", city: "Chandigarh", company: "Gill Motors", unread: true,
    extracted: { intent: "quote", service: "Launch film", estValuePaise: lakh(8), city: "Chandigarh", suggestedOwnerId: "dp", confidence: 0.58 },
    body: "Hi, we're launching an EV showroom in Jan. Looking for a launch film + social cutdowns. Can we talk this week?",
  },
];

export function useLiveArrivals() {
  useEffect(() => {
    if (!IS_DEMO) return;
    let i = 0;
    const tick = () => {
      if (i >= POOL.length) return;
      const p = POOL[i++]!;
      const { body, ...rest } = p;
      const at = new Date().toISOString();
      useCrm.getState().receive({
        ...rest,
        id: `cv-live-${i}-${Date.now()}`,
        lastMessageAt: at,
        windowExpiresAt: rest.channel === "whatsapp" ? new Date(Date.now() + 24 * 3600_000).toISOString() : undefined,
        messages: [{ id: `m-live-${i}`, direction: "in", body, at }],
      });
    };
    const first = window.setTimeout(tick, 15_000);
    const every = window.setInterval(tick, 75_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);
}
