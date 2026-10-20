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

/* ---------- Projects ---------- */
export const TASK_STATUSES = ["todo", "in_progress", "review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", review: "In review", done: "Done" };
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
/** Client sign-off on a task: none needed, waiting, approved, or changes asked for. */
export const APPROVALS = ["none", "pending", "approved", "changes"] as const;
export type Approval = (typeof APPROVALS)[number];
export const APPROVAL_LABEL: Record<Approval, string> = { none: "No approval", pending: "Awaiting client", approved: "Approved", changes: "Changes asked" };
export const PROJECT_STATUSES = ["planning", "active", "delivered", "closed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { planning: "Planning", active: "Active", delivered: "Delivered", closed: "Closed" };
export const DELIVERABLE_STATUSES = ["pending", "in_progress", "delivered"] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

/** Suggested crew roles per business (free text is fine too). */
export const CREW_ROLES: Record<Business, string[]> = {
  photography: ["Lead photographer", "Candid photographer", "Traditional photographer", "Videographer", "Drone operator", "Photo editor", "Film editor", "Album designer"],
  marketing: ["Account manager", "Designer", "Video editor", "Performance marketer", "Content writer", "Social media manager"],
};

/**
 * A project template: the checklist and deliverables every new project of a business starts with.
 * `from` is what a due date counts from — the event (wedding) date or the day the deal was confirmed.
 */
export type TemplateItem = { title: string; from: "event" | "confirmed"; days: number; priority: Priority; approval?: boolean };
export type ProjectTemplate = { tasks: TemplateItem[]; deliverables: { name: string; from: "event" | "confirmed"; days: number }[] };
export type Templates = Record<Business, ProjectTemplate>;

export const DEFAULT_TEMPLATES: Templates = {
  photography: {
    tasks: [
      { title: "Booking advance received", from: "confirmed", days: 3, priority: "high" },
      { title: "Confirm functions, timings and venue", from: "event", days: -30, priority: "normal" },
      { title: "Assign photo and video crew", from: "event", days: -21, priority: "high" },
      { title: "Pre-wedding shoot (if booked)", from: "event", days: -14, priority: "low" },
      { title: "Shot list and family groups from the couple", from: "event", days: -7, priority: "normal" },
      { title: "Equipment check and backups", from: "event", days: -2, priority: "high" },
      { title: "Wedding day coverage", from: "event", days: 0, priority: "urgent" },
      { title: "Back up and cull photos", from: "event", days: 2, priority: "high" },
      { title: "Edit photos", from: "event", days: 14, priority: "normal" },
      { title: "Edit wedding film", from: "event", days: 30, priority: "normal" },
      { title: "Client review and approval", from: "event", days: 35, priority: "normal", approval: true },
      { title: "Album design", from: "event", days: 45, priority: "normal", approval: true },
      { title: "Final delivery and balance payment", from: "event", days: 60, priority: "high" },
    ],
    deliverables: [
      { name: "Edited photos", from: "event", days: 14 },
      { name: "Highlight film", from: "event", days: 30 },
      { name: "Full wedding film", from: "event", days: 45 },
      { name: "Album", from: "event", days: 60 },
    ],
  },
  marketing: {
    tasks: [
      { title: "Kick-off call and onboarding", from: "confirmed", days: 3, priority: "high" },
      { title: "Collect brand assets and account access", from: "confirmed", days: 5, priority: "normal" },
      { title: "Strategy and monthly content calendar", from: "confirmed", days: 10, priority: "high" },
      { title: "Content calendar approval", from: "confirmed", days: 12, priority: "normal", approval: true },
      { title: "Create the month's creatives", from: "confirmed", days: 20, priority: "normal", approval: true },
      { title: "Campaign setup", from: "confirmed", days: 21, priority: "normal" },
      { title: "Publish and monitor", from: "confirmed", days: 30, priority: "normal" },
      { title: "Monthly report", from: "confirmed", days: 35, priority: "normal" },
      { title: "Plan next month's calendar", from: "confirmed", days: 40, priority: "normal" },
    ],
    deliverables: [
      { name: "Monthly content calendar", from: "confirmed", days: 10 },
      { name: "Month's creatives", from: "confirmed", days: 20 },
      { name: "Monthly report", from: "confirmed", days: 35 },
    ],
  },
};
