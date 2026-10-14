/** Open pipeline stages, in order. Lost is a terminal state outside the meter. */
export const STAGES = ["new", "qualified", "proposal", "negotiation", "won"] as const;
export type Stage = (typeof STAGES)[number] | "lost";

export const STAGE_LABEL: Record<Stage, string> = {
  new: "New",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const CHANNELS = ["gmail", "calendar", "instagram", "facebook", "whatsapp", "web", "referral"] as const;
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
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  gmail: "Gmail",
  calendar: "Google Calendar",
  instagram: "Instagram",
  facebook: "Facebook Lead Ads",
  whatsapp: "WhatsApp",
  web: "Website form",
  referral: "Referral",
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
