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

/* ---------- Roles and what each may do ---------- */
export const ROLES = ["admin", "sales", "pm", "finance", "crew"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { admin: "Owner / Admin", sales: "Sales", pm: "Project manager", finance: "Finance", crew: "Team / Freelancer" };
export const ROLE_HELP: Record<Role, string> = {
  admin: "Everything, including the team, integrations, stages and templates.",
  sales: "Leads, Inbox, follow-ups and clients they own; sees projects and invoices.",
  pm: "Runs projects, crews and checklists; sees leads and clients.",
  finance: "Invoices, payments and credit notes; sees leads, clients and projects.",
  crew: "Only the projects they're on and their own tasks.",
};
/** Old role names, from before the five roles. */
export const roleOf = (r: string): Role => ((ROLES as readonly string[]).includes(r) ? (r as Role) : r === "member" || r === "manager" ? "sales" : "crew");

/** The three areas of work. "own" = sales: change only your own records; crew: only your projects and tasks. */
export type Area = "sales" | "projects" | "finance";
export type Access = "edit" | "own" | "view" | "none";
export const ACCESS: Record<Role, Record<Area, Access>> = {
  admin: { sales: "edit", projects: "edit", finance: "edit" },
  sales: { sales: "own", projects: "view", finance: "view" },
  pm: { sales: "view", projects: "edit", finance: "none" },
  finance: { sales: "view", projects: "view", finance: "edit" },
  crew: { sales: "none", projects: "own", finance: "none" },
};
export const accessOf = (role: string, area: Area): Access => ACCESS[roleOf(role)][area];

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

/* ---------- Notifications ---------- */
/** In-app notification groups each teammate can turn on or off for themselves. */
export const NOTIFICATION_KINDS = ["lead", "assigned", "project", "task", "comment", "won", "accepted", "late", "summary"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type NotificationPreferences = { app: Record<NotificationKind, boolean> };
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  app: Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, true])) as Record<NotificationKind, boolean>,
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

/* ---------- Finance: packages, payment plans, expenses ---------- */
/** SAC codes per business: photography & videography services; advertising services. Confirm with the CA. */
export const DEFAULT_SAC: Record<Business, string> = { photography: "998383", marketing: "998361" };

export type Package = { id: string; business: Business; name: string; description?: string; pricePaise: number; monthly?: boolean; addOn?: boolean };
/** One stage of a payment plan: a share of the total, due a number of days from the event or the booking. */
export type PlanStep = { label: string; percent: number; from: "event" | "confirmed"; days: number };
export type FinanceSettings = { packages: Package[]; plans: Record<Business, PlanStep[]>; terms: Record<Business, string> };

const L = 100_000_00; // ₹1 lakh in paise
export const DEFAULT_FINANCE: FinanceSettings = {
  packages: [
    { id: "ph-classic", business: "photography", name: "Classic wedding", description: "1 day · candid + traditional photography · highlight film · 300 edited photos", pricePaise: 1.5 * L },
    { id: "ph-signature", business: "photography", name: "Signature wedding", description: "2 days · candid + traditional photo & video · highlight + full film · album", pricePaise: 3 * L },
    { id: "ph-premium", business: "photography", name: "Premium wedding", description: "3 days · full crew · drone · cinematic film · 2 albums", pricePaise: 5 * L },
    { id: "ph-prewed", business: "photography", name: "Pre-wedding shoot", description: "Half day, one location", pricePaise: 0.5 * L, addOn: true },
    { id: "ph-drone", business: "photography", name: "Drone coverage", description: "Per day", pricePaise: 0.25 * L, addOn: true },
    { id: "ph-album", business: "photography", name: "Extra album", description: "40 pages, premium binding", pricePaise: 0.3 * L, addOn: true },
    { id: "ph-sde", business: "photography", name: "Same-day edit", description: "Short film shown at the reception", pricePaise: 0.4 * L, addOn: true },
    { id: "mk-starter", business: "marketing", name: "Social Starter", description: "12 posts + 4 reels a month, 2 platforms, monthly report", pricePaise: 0.4 * L, monthly: true },
    { id: "mk-growth", business: "marketing", name: "Social Growth", description: "20 posts + 8 reels, community management, content calendar", pricePaise: 0.75 * L, monthly: true },
    { id: "mk-ads", business: "marketing", name: "Ads management", description: "Meta + Google campaigns; ad spend billed separately", pricePaise: 0.5 * L, monthly: true },
    { id: "mk-shoot", business: "marketing", name: "Brand shoot", description: "Half-day product or brand shoot, 30 edited photos", pricePaise: 0.6 * L, addOn: true },
  ],
  plans: {
    photography: [
      { label: "Booking advance", percent: 30, from: "confirmed", days: 0 },
      { label: "Before the wedding", percent: 50, from: "event", days: -7 },
      { label: "On delivery", percent: 20, from: "event", days: 45 },
    ],
    marketing: [{ label: "Advance", percent: 100, from: "confirmed", days: 0 }],
  },
  terms: {
    photography:
      "The booking is confirmed when the advance is received. The advance is non-refundable but can move to a new date once, subject to availability. Travel and stay outside the city are billed at actuals. Edited photos are delivered within 3 weeks and films within 6 weeks of the event. Prices exclude GST at 18%.",
    marketing:
      "Monthly fees are payable in advance. Either side may end the engagement with 30 days' written notice. Ad spend is paid directly to the platforms and is not included. Prices exclude GST at 18%.",
  },
};

export const EXPENSE_CATEGORIES = ["Freelancers & crew", "Travel & stay", "Equipment & rentals", "Printing & albums", "Ad spend", "Software & subscriptions", "Studio rent & utilities", "Food & hospitality", "Salaries", "Other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
