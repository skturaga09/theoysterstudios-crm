/**
 * Pipeline stages are set per business (Settings → Pipelines & stages), so a stage is just its id. Every pipeline
 * has exactly one "won" stage (Confirmed) and one "lost" stage; the rest are "open", in order.
 */
export type Stage = string;
export type StageKind = "open" | "won" | "lost";
export type PipelineStage = { id: Stage; label: string; kind: StageKind; /** chance it closes, 0–1, for the weighted forecast */ probability: number };

/** The client's starting list; each business gets its own copy to change. */
export const DEFAULT_STAGES: PipelineStage[] = [
  { id: "new", label: "New lead", kind: "open", probability: 0.1 },
  { id: "contacted", label: "Contacted", kind: "open", probability: 0.2 },
  { id: "qualified", label: "Qualified", kind: "open", probability: 0.3 },
  { id: "proposal", label: "Proposal sent", kind: "open", probability: 0.5 },
  { id: "negotiation", label: "Negotiation", kind: "open", probability: 0.7 },
  { id: "won", label: "Confirmed", kind: "won", probability: 1 },
  { id: "lost", label: "Lost", kind: "lost", probability: 0 },
];

/** Older code paths and the demo use these ids; real labels come from the business's pipeline. */
export const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won"] as const;
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(DEFAULT_STAGES.map((s) => [s.id, s.label]));

export const CHANNELS = ["gmail", "calendar", "instagram", "facebook", "whatsapp", "web", "referral", "phone", "google", "event", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

/** Mono monograms used by ChannelChip. No brand logos in app chrome. */
export const CHANNEL_MONOGRAM: Record<Channel, string> = {
  gmail: "GM",
  calendar: "CAL",
  instagram: "IG",
  facebook: "FB",
  whatsapp: "WA",
  web: "WEB",
  referral: "REF",
  phone: "TEL",
  google: "GGL",
  event: "EVT",
  other: "…",
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  gmail: "Gmail",
  calendar: "Google Calendar",
  instagram: "Instagram",
  facebook: "Facebook Lead Ads",
  whatsapp: "WhatsApp",
  web: "Website form",
  referral: "Referral",
  phone: "Phone call",
  google: "Google",
  event: "Event",
  other: "Other",
};

export const HEALTHS = ["ok", "warn", "risk"] as const;
export type Health = (typeof HEALTHS)[number];

export const HEALTH_LABEL: Record<Health, string> = {
  ok: "On track",
  warn: "Watch",
  risk: "At risk",
};

export const ROLES = ["admin", "manager", "member"] as const;
export type Role = (typeof ROLES)[number];

/** The studio runs two businesses from one CRM; most records belong to one of them. */
export const BUSINESSES = ["photography", "marketing"] as const;
export type Business = (typeof BUSINESSES)[number];
export const BUSINESS_LABEL: Record<Business, string> = { photography: "Wedding Photography", marketing: "Marketing Agency" };
export const BUSINESS_SHORT: Record<Business, string> = { photography: "Photography", marketing: "Marketing" };
/** "all" = both businesses together. */
export type BusinessView = Business | "all";

/** Pipelines for both businesses. */
export type Pipelines = Record<Business, PipelineStage[]>;
export const DEFAULT_PIPELINES: Pipelines = { photography: DEFAULT_STAGES, marketing: DEFAULT_STAGES };
/** A deal's stage in its business's pipeline; unknown ids fall back to a sensible open stage so nothing breaks. */
export const stageIn = (pipelines: Pipelines, business: Business | undefined, id: Stage): PipelineStage =>
  pipelines[business ?? "photography"].find((s) => s.id === id) ?? {
    id,
    label: STAGE_LABEL[id] ?? id,
    kind: id === "won" ? "won" : id === "lost" ? "lost" : "open",
    probability: 0,
  };

/** Suggested services per business (free text is fine too). */
export const SERVICES: Record<Business, string[]> = {
  photography: ["Wedding photography", "Wedding videography", "Pre-wedding shoot", "Album", "Drone", "Cinematic film", "Editing"],
  marketing: ["Social media management", "Performance marketing", "Branding", "Website development", "Content creation", "Graphic design", "Video production", "SEO"],
};
