/**
 * Seed data from the client mockup (reference/pinnacle-revamp.html), expanded so every
 * screen opens in a realistic working state. Dates are relative to today so the data
 * never goes stale. Mockup "Delivery" stage → Won (see DECISIONS.md).
 */
import { CHANNELS, DEFAULT_TEMPLATES, lakh, projectFromDeal, type Channel, type RoutingRule, type Stage } from "@pinnacle/shared";
import type { Workspace } from "@pinnacle/shared/schemas";
import type {
  Activity,
  Company,
  Contact,
  Conversation,
  Deal,
  Invoice,
  Lead,
  Member,
  Project,
  Task,
} from "./types";

/* ---------- time helpers ---------- */
const today = new Date();
today.setHours(0, 0, 0, 0);
/** ISO for today + `days`, at hh:mm local time. */
export const at = (days: number, hh = 10, mm = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
/** Minutes ago from now. */
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/* ---------- team ---------- */
/** The signed-in member's id. "sr" in the sample data; replaced at sign-in (a live binding, so importers see the update). */
export let ME_ID = "sr";
export const setMeId = (id: string) => {
  ME_ID = id;
};
export const MEMBERS: Member[] = [
  { id: "sr", name: "Saksham Rao", email: "saksham@theoysterstudios.in", role: "admin", title: "Founder", status: "active", lastSignInAt: ago(4), addedAt: at(-420) },
  { id: "rv", name: "Riya V", email: "riya@theoysterstudios.in", role: "pm", title: "Account lead", status: "active", lastSignInAt: ago(38), addedAt: at(-300) },
  { id: "ak", name: "Aditi K", email: "aditi.k@gmail.com", role: "crew", title: "Producer", status: "active", lastSignInAt: ago(60 * 20), addedAt: at(-210) },
  { id: "dp", name: "Dev Patel", email: "dev@theoysterstudios.in", role: "sales", title: "New business", status: "active", lastSignInAt: ago(60 * 3), addedAt: at(-150) },
];

/* ---------- companies ---------- */
const co = (
  id: string, name: string, domain: string, industry: string, city: string, ownerId: string,
  tags: string[], lastMin: number, extra: Partial<Company> = {},
): Company => ({ id, name, domain, industry, city, ownerId, tags, lastActivityAt: ago(lastMin), ...extra });

export const COMPANIES: Company[] = [
  co("atlas", "Atlas Athletic", "atlasathletic.in", "Sportswear", "Bengaluru", "sr", ["Retainer", "Priority"], 32, { gstin: "29AAKCA4120M1Z5", employees: 45 }),
  co("northwind", "Northwind Ventures", "northwind.vc", "Venture capital", "New Delhi", "dp", ["Launch"], 180, { gstin: "07AAGFN8811K1Z2", employees: 30 }),
  co("sable", "Sable & Oak", "sableoak.co", "Furniture", "Mumbai", "sr", ["Rebrand"], 60 * 26, { employees: 60 }),
  co("cirrus", "Cirrus Travel", "cirrus.travel", "Travel", "Goa", "rv", ["Won"], 60 * 4, { gstin: "30AAECC2231P1ZQ", employees: 80 }),
  co("halcyon", "Halcyon Hotels", "halcyon.com", "Hospitality", "Goa", "rv", ["At risk"], 60 * 4, { gstin: "30AABCH9902L1Z8", employees: 400 }),
  co("verdant", "Verdant Botanicals", "verdant.bio", "Wellness", "Bengaluru", "dp", [], 60 * 22, { employees: 18 }),
  co("foxglove", "Foxglove Interiors", "foxglove.design", "Interiors", "Jaipur", "dp", ["Content"], 60 * 6, { employees: 25 }),
  co("ora", "Ora Wellness", "orawellness.in", "Wellness", "Pune", "ak", [], 60 * 50, { employees: 40 }),
  co("lumen", "Lumen Skincare", "lumenskin.com", "Beauty", "Bengaluru", "ak", ["Films"], 60 * 21, { gstin: "29AAFCL6618R1Z1", employees: 55 }),
  co("marrow", "Marrow & Co", "marrowco.in", "Food & beverage", "Chennai", "ak", ["Packaging"], 60 * 72, { gstin: "33AAJFM3345N1Z9", employees: 22 }),
  co("meridian", "Meridian Coffee", "meridian.coffee", "Food & beverage", "Pune", "rv", ["Renewal"], 60 * 5, { gstin: "27AAKCM7712D1ZX", employees: 120 }),
  co("cobalt", "Cobalt Fitness", "cobaltfit.app", "Fitness", "Hyderabad", "dp", [], 60 * 24, { employees: 35 }),
  co("pallete", "Pallete Foods", "pallete.in", "Food & beverage", "Mumbai", "dp", ["Social"], 60 * 96, { gstin: "27AAHCP5521F1Z4", employees: 70 }),
  co("tessera", "Tessera Capital", "tessera.capital", "Finance", "New Delhi", "sr", [], 60 * 2, { employees: 15 }),
];
export const companyById = (id?: string) => COMPANIES.find((c) => c.id === id);

/* ---------- contacts ---------- */
const ct = (
  id: string, name: string, companyId: string | undefined, title: string, city: string, ownerId: string,
  source: Channel, lastMin: number, extra: Partial<Contact> = {},
): Contact => ({ id, name, companyId, title, city, ownerId, source, lastActivityAt: ago(lastMin), ...extra });

export const CONTACTS: Contact[] = [
  ct("c-riya", "Riya Menon", "atlas", "Head of Brand", "Bengaluru", "sr", "referral", 32, { email: "riya@atlasathletic.in", phone: "+91 98450 21877" }),
  ct("c-arjun", "Arjun Rao", "atlas", "Marketing Lead", "Bengaluru", "sr", "referral", 60 * 30, { email: "arjun@atlasathletic.in" }),
  ct("c-tara", "Tara Bhatia", "northwind", "Partner", "New Delhi", "dp", "gmail", 180, { email: "tara@northwind.vc" }),
  ct("c-kabir", "Kabir Malhotra", "sable", "Founder", "Mumbai", "sr", "instagram", 60 * 26, { handle: "@kabir.sableoak" }),
  ct("c-neha", "Neha Fernandes", "cirrus", "CMO", "Goa", "rv", "referral", 60 * 4, { email: "neha@cirrus.travel" }),
  ct("c-aman", "Aman Desai", "halcyon", "Marketing Director", "Goa", "rv", "web", 60 * 4, { email: "aman.desai@halcyon.com" }),
  ct("c-priya", "Priya Nair", "verdant", "Co-founder", "Bengaluru", "dp", "web", 60 * 22, { email: "priya@verdant.bio" }),
  ct("c-ishita", "Ishita Jain", "foxglove", "Creative Director", "Jaipur", "dp", "instagram", 60 * 6, { handle: "@foxglove.design" }),
  ct("c-dhruv", "Dhruv Kulkarni", "ora", "Growth Lead", "Pune", "ak", "gmail", 60 * 50, { email: "dhruv@orawellness.in" }),
  ct("c-sneha", "Sneha Reddy", "lumen", "Brand Manager", "Bengaluru", "ak", "facebook", 60 * 21, { phone: "+91 99000 41235" }),
  ct("c-vivek", "Vivek Raman", "marrow", "Founder", "Chennai", "ak", "gmail", 60 * 72, { email: "vivek@marrowco.in" }),
  ct("c-pooja", "Pooja Shah", "meridian", "Marketing Head", "Pune", "rv", "whatsapp", 60 * 5, { phone: "+91 98220 77310" }),
  ct("c-nikhil", "Nikhil Bansal", "cobalt", "Founder", "Hyderabad", "dp", "whatsapp", 60 * 24, { phone: "+91 99496 11802" }),
  ct("c-zoya", "Zoya Merchant", "pallete", "Brand Lead", "Mumbai", "dp", "instagram", 60 * 96, { handle: "@pallete.foods" }),
  ct("c-rohan", "Rohan Kapoor", "tessera", "Managing Partner", "New Delhi", "sr", "gmail", 60 * 2, { email: "rohan@tessera.capital" }),
];
export const contactById = (id?: string) => CONTACTS.find((c) => c.id === id);

/* ---------- deals ---------- */
let pos = 0;
const dl = (
  id: string, companyId: string, title: string, stage: Stage, l: number, closeDays: number,
  ownerId: string, channel: Channel, health: Deal["health"], extra: Partial<Deal> = {},
): Deal => ({
  id, companyId, title, stage, valuePaise: lakh(l), closeAt: at(closeDays), ownerId, channel, health,
  position: pos++, createdAt: at(-40 + (pos % 25)), ...extra,
});

export const DEALS: Deal[] = [
  dl("d-verdant", "verdant", "Brand refresh", "new", 6.5, 36, "dp", "web", "ok", { contactId: "c-priya", nextStep: "Discovery call booked for Friday." }),
  dl("d-cobalt", "cobalt", "Social retainer", "new", 2.4, 32, "dp", "whatsapp", "ok", { contactId: "c-nikhil", nextStep: "Share retainer tiers on WhatsApp." }),
  dl("d-tessera", "tessera", "Brand identity", "new", 9.0, 45, "sr", "gmail", "ok", { contactId: "c-rohan", nextStep: "Reply with availability for an intro call." }),
  dl("d-sable", "sable", "Full rebrand", "qualified", 9.5, 4, "sr", "instagram", "warn", { contactId: "c-kabir", nextStep: "Follow up — no reply since the scoping call." }),
  dl("d-ora", "ora", "Website", "qualified", 5.0, 18, "ak", "gmail", "ok", { contactId: "c-dhruv", nextStep: "Send sitemap and rough estimate." }),
  dl("d-marrow2", "marrow", "Festive packaging", "qualified", 4.1, 26, "ak", "gmail", "warn", { contactId: "c-vivek", nextStep: "Confirm SKU count before quoting." }),
  dl("d-northwind", "northwind", "Launch film", "proposal", 11.0, 6, "dp", "gmail", "ok", { contactId: "c-tara", nextStep: "Proposal sent Monday. Walk-through call Thursday 4 pm." }),
  dl("d-foxglove", "foxglove", "Content + shoot", "proposal", 6.4, 2, "dp", "instagram", "warn", { contactId: "c-ishita", nextStep: "Moodboard approval pending." }),
  dl("d-atlas-film", "atlas", "Launch film add-on", "proposal", 4.0, 20, "sr", "referral", "ok", { contactId: "c-riya" }),
  dl("d-atlas", "atlas", "Annual retainer", "negotiation", 13.0, 8, "sr", "referral", "ok", { contactId: "c-riya", nextStep: "Send revised SOW with the quarterly campaign add-on. Decision expected Friday." }),
  dl("d-lumen", "lumen", "Product films", "negotiation", 4.8, 4, "ak", "facebook", "risk", { contactId: "c-sneha", nextStep: "Client pushing back on usage rights fee." }),
  dl("d-cirrus", "cirrus", "Rebrand", "won", 8.5, -3, "rv", "referral", "ok", { contactId: "c-neha", wonAt: at(-3, 15) }),
  dl("d-halcyon", "halcyon", "Campaign", "won", 7.2, -12, "rv", "web", "risk", { contactId: "c-aman", wonAt: at(-12) }),
  dl("d-pallete", "pallete", "Social", "won", 3.2, -9, "dp", "instagram", "ok", { contactId: "c-zoya", wonAt: at(-9) }),
  dl("d-marrow", "marrow", "Packaging", "won", 3.1, -20, "ak", "gmail", "ok", { contactId: "c-vivek", wonAt: at(-20) }),
  dl("d-meridian", "meridian", "Retainer renewal", "lost", 1.8, -5, "rv", "whatsapp", "risk", { contactId: "c-pooja", lostReason: "Moved retainer in-house" }),
];

/* ---------- inbox ---------- */
const m = (dir: "in" | "out", body: string, atIso: string, authorId?: string) => ({
  id: Math.random().toString(36).slice(2, 9), direction: dir, body, at: atIso, authorId,
});

export const CONVERSATIONS: Conversation[] = [
  {
    id: "cv-ishaan", channel: "instagram", name: "Ishaan Mehta", handle: "@pressedbyishaan", city: "Mumbai", company: "Pressed Juice Co.",
    unread: true, lastMessageAt: ago(26),
    extracted: { intent: "quote", service: "Packaging · 6 SKUs", estValuePaise: lakh(4.5), city: "Mumbai", suggestedOwnerId: "ak", confidence: 0.82 },
    messages: [
      m("in", "Hi! Saw your packaging work for Marrow & Co, it's lovely.", ago(31)),
      m("in", "We're launching a cold-pressed juice line in January and need packaging for 6 SKUs. Budget is around 4–5 lakh. Could you share a quote and timeline?", ago(26)),
    ],
  },
  {
    id: "cv-kavya", channel: "whatsapp", name: "Kavya Iyer", handle: "+91 98861 40217", city: "Bengaluru", company: "Dew Theory",
    unread: true, lastMessageAt: ago(54), windowExpiresAt: new Date(Date.now() + 23 * 3600_000).toISOString(),
    extracted: { intent: "quote", service: "3 product films", estValuePaise: lakh(6), city: "Bengaluru", suggestedOwnerId: "ak", confidence: 0.74 },
    messages: [
      m("in", "Hello, we're a D2C skincare brand (Dew Theory).", ago(58)),
      m("in", "Looking for 3 short product films for a November launch. Do you have availability in the first week of Nov? What would it roughly cost?", ago(54)),
    ],
  },
  {
    id: "cv-rohan", channel: "gmail", name: "Rohan Kapoor", handle: "rohan@tessera.capital", city: "New Delhi", company: "Tessera Capital",
    contactId: "c-rohan", dealId: "d-tessera", assigneeId: "sr", unread: true, lastMessageAt: ago(118), subject: "Brand identity for Tessera Capital",
    extracted: { intent: "meeting", service: "Brand identity", estValuePaise: lakh(9), city: "New Delhi", suggestedOwnerId: "sr", confidence: 0.9 },
    messages: [
      m("in", "Hi Saksham,\n\nWe're a new early-stage fund and need a full identity: name lockup, deck system and a one-page site. Tara at Northwind suggested you.\n\nCould we get 30 minutes this week?\n\nRohan", ago(118)),
    ],
  },
  {
    id: "cv-ananya", channel: "web", name: "Ananya Rao", handle: "ananya@flowyoga.in", city: "Hyderabad", company: "Flow Yoga",
    unread: false, lastMessageAt: ago(60 * 5),
    extracted: { intent: "quote", service: "Website + brand refresh", estValuePaise: lakh(3.5), city: "Hyderabad", suggestedOwnerId: "dp", confidence: 0.68 },
    messages: [
      m("in", "Website form · Service: Website + brand refresh\nBudget: ₹3–4 lakh\nMessage: We run 4 yoga studios in Hyderabad and want a refreshed identity and a booking-friendly website before January.", ago(60 * 5)),
    ],
  },
  {
    id: "cv-farhan", channel: "facebook", name: "Farhan Shaikh", handle: "+91 90110 55821", city: "Pune", company: "Brewhouse 27",
    unread: false, lastMessageAt: ago(60 * 7),
    extracted: { intent: "quote", service: "Social media retainer", estValuePaise: lakh(1.8), city: "Pune", suggestedOwnerId: "dp", confidence: 0.6 },
    messages: [m("in", "Lead form · Interested in: Social media retainer\nBusiness: Brewhouse 27 (craft brewery)\nBest time to call: evenings", ago(60 * 7))],
  },
  {
    id: "cv-meera", channel: "calendar", name: "Meera Pillai", handle: "meera@hearthandco.in", city: "Kochi", company: "Hearth & Co",
    unread: false, lastMessageAt: ago(60 * 9),
    extracted: { intent: "meeting", service: "Intro call", estValuePaise: lakh(5), city: "Kochi", suggestedOwnerId: "rv", confidence: 0.55 },
    messages: [m("in", `Booked "Intro call — The Oyster Studios" for ${new Date(at(2, 11)).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST via the booking page.\nNote: Homeware brand, looking at packaging + photography.`, ago(60 * 9))],
  },
  {
    id: "cv-nikhil", channel: "whatsapp", name: "Nikhil Bansal", handle: "+91 99496 11802", city: "Hyderabad", company: "Cobalt Fitness",
    contactId: "c-nikhil", dealId: "d-cobalt", assigneeId: "dp", unread: false, lastMessageAt: ago(60 * 30),
    windowExpiresAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    messages: [
      m("in", "Hey Dev, can you send the retainer options you mentioned?", ago(60 * 31)),
      m("out", "Sure Nikhil, putting them together. Will share by tomorrow.", ago(60 * 30), "dp"),
    ],
  },
  {
    id: "cv-sana", channel: "instagram", name: "Sana Qureshi", handle: "@sana.creates", city: "Lucknow",
    unread: false, lastMessageAt: ago(60 * 26),
    extracted: { intent: "question", service: "Influencer shoot", estValuePaise: lakh(0.8), city: "Lucknow", suggestedOwnerId: "ak", confidence: 0.35 },
    messages: [m("in", "love your reels for Lumen!! do you guys do influencer shoots too?", ago(60 * 26))],
  },
  {
    id: "cv-riya", channel: "gmail", name: "Riya Menon", handle: "riya@atlasathletic.in", city: "Bengaluru", company: "Atlas Athletic",
    contactId: "c-riya", dealId: "d-atlas", assigneeId: "sr", unread: false, lastMessageAt: ago(60 * 3), subject: "Re: Revised retainer scope & timeline",
    messages: [
      m("out", "Hi Riya, attached the updated SOW for the annual engagement, including the quarterly campaign.", ago(60 * 5), "sr"),
      m("in", "Thanks Saksham. Looks good. Finance wants to check the payment schedule — can we split it monthly?", ago(60 * 3)),
    ],
  },
];

/* ---------- activities ---------- */
export const ACTIVITIES: Activity[] = [
  { id: "a1", type: "stage", dealId: "d-atlas", companyId: "atlas", actorId: "sr", text: "moved Annual retainer to Negotiation", at: ago(32) },
  { id: "a2", type: "email", dealId: "d-atlas", companyId: "atlas", actorId: "sr", text: "sent an email", body: "Subject: Revised retainer scope & timeline — attached the updated SOW for the annual engagement.", at: ago(60 * 5) },
  { id: "a3", type: "call", dealId: "d-atlas", companyId: "atlas", actorId: "sr", text: "logged a call · 32 min", body: "Walked through pricing. Riya wants to add a quarterly campaign. Sending revised contract.", at: ago(60 * 9) },
  { id: "a4", type: "note", dealId: "d-atlas", companyId: "atlas", actorId: "dp", text: "added a note", body: "Warm account — referred by Cirrus. Decision expected by end of week.", at: ago(60 * 26) },
  { id: "a5", type: "lead", dealId: "d-atlas", companyId: "atlas", actorId: "sr", text: "captured lead from Referral (Cirrus Travel)", at: at(-38) },
  { id: "a6", type: "won", dealId: "d-cirrus", companyId: "cirrus", actorId: "rv", text: "marked Rebrand as Won · ₹8.5 L", at: at(-3, 15) },
  { id: "a7", type: "email", dealId: "d-halcyon", companyId: "halcyon", actorId: "rv", text: "emailed a payment reminder", at: ago(60) },
  { id: "a8", type: "meeting", dealId: "d-northwind", companyId: "northwind", actorId: "dp", text: "met Tara Bhatia · proposal walkthrough", at: ago(60 * 24) },
  { id: "a9", type: "note", dealId: "d-lumen", companyId: "lumen", actorId: "ak", text: "added a note", body: "Usage rights for paid social are the sticking point.", at: ago(60 * 5) },
];

/* ---------- tasks ---------- */
export const TASKS: Task[] = [
  { id: "t1", title: "Chase Halcyon overdue invoice · ₹3.2 L", dueAt: at(-2, 11), done: false, assigneeId: "rv", dealId: "d-halcyon", companyId: "halcyon" },
  { id: "t2", title: "Send Sable & Oak follow-up", dueAt: at(-1, 17), done: false, assigneeId: "sr", dealId: "d-sable", companyId: "sable" },
  { id: "t3", title: "Send revised SOW to Atlas", dueAt: at(0, 16), done: false, assigneeId: "sr", dealId: "d-atlas", companyId: "atlas" },
  { id: "t4", title: "Approve Foxglove moodboard", dueAt: at(0, 18), done: false, assigneeId: "dp", dealId: "d-foxglove", companyId: "foxglove" },
  { id: "t5", title: "Reply to Rohan (Tessera) with call slots", dueAt: at(0, 19), done: false, assigneeId: "sr", dealId: "d-tessera", companyId: "tessera" },
  { id: "t6", title: "Review Cirrus rebrand direction", dueAt: at(0, 12), done: true, doneAt: ago(90), assigneeId: "rv", dealId: "d-cirrus", companyId: "cirrus" },
  { id: "t7", title: "Confirm Northwind shoot crew", dueAt: at(2, 11), done: false, assigneeId: "dp", dealId: "d-northwind", companyId: "northwind" },
  { id: "t8", title: "Kickoff call — Ora Wellness", dueAt: at(3, 15), done: false, assigneeId: "ak", dealId: "d-ora", companyId: "ora" },
  { id: "t9", title: "Send Cobalt retainer tiers", dueAt: at(1, 12), done: false, assigneeId: "dp", dealId: "d-cobalt", companyId: "cobalt" },
  { id: "t10", title: "Lock Q4 retainer pricing", dueAt: at(-1, 12), done: true, doneAt: at(-1, 12), assigneeId: "sr" },
];

/* ---------- invoices ---------- */
const SAC = "998391"; // Specialty design services
const inv = (
  id: string, number: string, companyId: string, dealId: string | undefined, issued: number, due: number,
  supply: "intra" | "inter", lines: [string, number][], payments: [number, number][] = [], sent = true,
): Invoice => ({
  id, number, companyId, dealId, issuedAt: at(issued), dueAt: at(due), supply, sent,
  lines: lines.map(([desc, l]) => ({ desc, sac: SAC, qty: 1, ratePaise: lakh(l) })),
  payments: payments.map(([d, l]) => ({ at: at(d), amountPaise: lakh(l) })),
});
/** Sample lead routing for the demo build. Signed in, the rules come from Settings → Lead routing. */
export const SAMPLE_ROUTING: RoutingRule[] = [
  { id: "r1", minPaise: lakh(10), ownerId: "sr" },
  { id: "r2", channel: "instagram", ownerId: "ak" },
  { id: "r3", city: "Goa", ownerId: "rv" },
  { id: "r4", channel: "web", ownerId: "dp" },
];

/** Sample studio details for the demo build. Signed in, the real ones come from Settings → Workspace. */
export const SAMPLE_WORKSPACE: Workspace = {
  studioName: "The Oyster Studios",
  legalName: "The Oyster Studios LLP",
  gstin: "29AAPFP7781K1ZD",
  address: "3rd Floor, 12 Lavelle Road, Bengaluru 560001",
  googleDomain: "",
  enquiryEmail: "",
  instagramHandle: "",
  whatsappNumber: "",
  membersSeeAllDeals: true,
};

export const INVOICES: Invoice[] = [
  inv("i41", "TOS/26-27/041", "halcyon", "d-halcyon", -40, -10, "inter", [["Campaign — phase 1 (concept + shoot)", 2.71]]),
  inv("i42", "TOS/26-27/042", "meridian", "d-meridian", -70, -40, "inter", [["Retainer — August", 1.02]]),
  inv("i43", "TOS/26-27/043", "marrow", "d-marrow", -52, -22, "inter", [["Packaging — final artwork, 4 SKUs", 1.61]]),
  inv("i44", "TOS/26-27/044", "pallete", "d-pallete", -100, -70, "inter", [["Social content — September", 1.27]]),
  inv("i45", "TOS/26-27/045", "cirrus", "d-cirrus", -3, 27, "inter", [["Rebrand — 50% advance", 3.6]], [[-1, 2.12]]),
  inv("i46", "TOS/26-27/046", "lumen", "d-lumen", -6, 24, "intra", [["Product films — pre-production", 2.03]]),
  inv("i47", "TOS/26-27/047", "atlas", "d-atlas", 0, 30, "intra", [["Annual retainer — Q1 (Nov–Jan)", 2.75]], [], false),
  inv("i40", "TOS/26-27/040", "cirrus", "d-cirrus", -45, -15, "inter", [["Brand audit", 1.2]], [[-20, 1.416]]),
];

/* ---------- lead history for Lead Flow (deterministic) ---------- */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CH_WEIGHT: Record<Channel, number> = { instagram: 38, gmail: 22, whatsapp: 26, web: 14, facebook: 18, calendar: 7, referral: 6, phone: 0, google: 0, event: 0, other: 0 };
/** Older leads have had time to progress; recent ones sit near New. */
function stageFor(r: number, ageDays: number, ch: Channel): Stage {
  const maturity = Math.min(1, ageDays / 60);
  const winBoost = ch === "referral" ? 0.18 : ch === "gmail" ? 0.06 : 0;
  const lost = 0.06 + maturity * 0.24;
  if (r < lost) return "lost";
  if (r < lost + (0.06 + winBoost) * (0.4 + maturity)) return "won";
  const rest = (r * 7) % 1;
  if (rest < 0.55 - maturity * 0.35) return "new";
  if (rest < 0.78 - maturity * 0.2) return "qualified";
  if (rest < 0.92) return "proposal";
  return "negotiation";
}
export const LEADS: Lead[] = (() => {
  const rnd = mulberry32(14_10_2026);
  const out: Lead[] = [];
  for (const ch of CHANNELS) {
    const n90 = Math.round(CH_WEIGHT[ch] * 2.4);
    for (let i = 0; i < n90; i++) {
      // ~42% of leads in the last 30 days, the rest spread across the quarter
      const age = rnd() < 0.42 ? rnd() * 30 : 30 + rnd() * 60;
      out.push({ id: `${ch}-${i}`, channel: ch, stage: stageFor(rnd(), age, ch), at: new Date(Date.now() - age * 86_400_000).toISOString() });
    }
  }
  return out;
})();

/* ---------- revenue (₹ lakh): collected vs target, last 12 months ---------- */
export const REVENUE = (() => {
  const collected = [38, 34, 42, 40, 47, 45, 52, 58, 54, 63, 60, 18.4];
  const target = [40, 40, 44, 44, 48, 48, 54, 56, 56, 62, 62, 24];
  return collected.map((c, i) => {
    const d = new Date(today);
    d.setDate(1);
    d.setMonth(d.getMonth() - (11 - i));
    return { month: d.toLocaleString("en-IN", { month: "short" }), collected: c, target: target[i]! };
  });
})();

/* ---------- channel connection status (sidebar + settings) ---------- */
export type ChannelStatus = {
  channel: Channel;
  label: string;
  status: "ok" | "warn" | "risk";
  lastEventMin: number;
  account: string;
  note?: string;
};
export const CHANNEL_STATUS: ChannelStatus[] = [
  { channel: "gmail", label: "Gmail", status: "ok", lastEventMin: 1, account: "hello@theoysterstudios.in" },
  { channel: "calendar", label: "Calendar", status: "ok", lastEventMin: 4, account: "hello@theoysterstudios.in" },
  { channel: "instagram", label: "Instagram", status: "ok", lastEventMin: 2, account: "@theoysterstudios" },
  { channel: "facebook", label: "Lead Ads", status: "warn", lastEventMin: 180, account: "The Oyster Studios (Page)", note: "Page token expires in 6 days. Re-authorise to keep receiving leads." },
  { channel: "whatsapp", label: "WhatsApp", status: "ok", lastEventMin: 1, account: "+91 80 4718 2200" },
  { channel: "web", label: "Website", status: "ok", lastEventMin: 12, account: "theoysterstudios.in/contact" },
];

/* Demo: split the sample work across the two businesses (keywords first, then alternate for an even mix). */
DEALS.forEach((d, i) => {
  d.business = /wedding|shoot|film|photo|lookbook|album|pre-wedding/i.test(d.title) ? "photography" : i % 2 ? "photography" : "marketing";
});
for (const c of COMPANIES) c.business = DEALS.find((d) => d.companyId === c.id)?.business;
for (const p of CONTACTS) p.business = COMPANIES.find((c) => c.id === p.companyId)?.business;
for (const inv of INVOICES) inv.business = DEALS.find((d) => d.id === inv.dealId)?.business ?? COMPANIES.find((c) => c.id === inv.companyId)?.business;
for (const t of TASKS) t.business = DEALS.find((d) => d.id === t.dealId)?.business;

/* Demo: follow-ups — one overdue, two today, three upcoming — on open deals. */
DEALS.filter((d) => d.stage !== "won" && d.stage !== "lost")
  .slice(0, 6)
  .forEach((d, i) => {
    d.nextFollowUpAt = at([-1, 0, 0, 1, 3, 5][i]!, 11);
  });

/* Demo: companies with a confirmed deal are clients since their first one. */
for (const c of COMPANIES) {
  const won = DEALS.filter((d) => d.companyId === c.id && d.stage === "won" && d.wonAt).map((d) => d.wonAt!).sort();
  if (won.length) c.clientSince = won[0];
}

/* Demo: every confirmed deal has its project, started from the default checklist; older tasks are done. */
export const PROJECTS: Project[] = [];
for (const d of DEALS.filter((x) => x.stage === "won")) {
  const { project, tasks } = projectFromDeal(d, DEFAULT_TEMPLATES);
  const id = `p-${d.id}`;
  PROJECTS.push({ ...project, id, crew: [{ memberId: d.ownerId, role: d.business === "marketing" ? "Account manager" : "Lead photographer" }] });
  tasks.forEach((t, i) => {
    const done = +new Date(t.dueAt) < Date.now() - 86_400_000;
    TASKS.push({ ...t, id: `pt-${d.id}-${i}`, projectId: id, done, status: done ? "done" : t.status, ...(done && t.approval === "pending" && { approval: "approved" as const }) });
  });
}
