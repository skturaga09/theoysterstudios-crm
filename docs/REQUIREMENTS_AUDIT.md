# CRM requirements audit

Audited against the client's “Wedding Photography + Marketing Agency” requirements on 20 October 2026.

## Delivery scope

The current responsive web CRM covers Phases 1–3 from the requirements. Phase 4 is explicitly described there as future work, so it is kept out of the authenticated staff CRM until product decisions and client-facing security requirements are supplied.

## Implemented

- Two businesses with Photography, Marketing and combined views across the CRM.
- Leads from manual entry, website, Instagram, WhatsApp, Facebook, Gmail and Google Calendar; routing, ownership, customizable stages, notes, calls and follow-ups.
- Quotations, flexible packages, payment plans, GST invoices, credit notes, Razorpay payment links and payment reminders.
- Automatic client conversion and project creation when a deal is confirmed.
- Photography functions, marketing retainers/content calendars, project templates, crew, tasks, priorities, comments, links, approvals, deliverables and deadlines.
- Five permission roles enforced by both the API and the UI.
- Central calendar plus a private subscribable calendar feed.
- Expenses, project and business profitability, owner dashboard and CSV/PDF-capable reports.
- Client and project file links, including CRM-created Google Drive project folders.
- In-app notifications for new leads, assignments, task comments, confirmations, late replies and a daily workload/deadline/payment summary. Each teammate's preferences are stored in the database.
- Responsive desktop, tablet and mobile layouts.
- Connected Inbox replies for Instagram and WhatsApp, plus Gmail/Calendar intake.

## Gaps closed in this audit

- Live sales reports now derive lead history from persisted deals rather than the demo-only arrival feed.
- Notification switches now load and save per teammate and are enforced when notifications are created.
- The daily summary now includes project deadlines, pending client approvals and upcoming weddings in addition to tasks, follow-ups and payments.
- Project pages now include confirmed value, invoiced revenue, money received, outstanding balance, project costs, actual/estimated profit and linked communication history for roles allowed to see them.
- Deal file lists now show the client's real proposals, agreements, contracts, briefs and Drive links instead of sample filenames.

## Intentionally future (Phase 4)

- Client login/portal, client-side approvals and client-visible content-calendar views.
- Native mobile applications; the current deliverable is the responsive web app requested for the first version.
- Advanced analytics, accounting-software integrations, additional marketing platforms and AI features.
- Electronic signatures and a client-side signing workflow. Accepted quotations now generate a printable service agreement with scope, fees, payment schedule, terms and signature blocks; e-signing still needs a product and compliance decision.
- Email notifications. The Google connection is deliberately read-only (`gmail.readonly`), so the CRM does not send mail or silently request broader mailbox access. In-app and approved WhatsApp notifications are active.

## Operational setup still required from the studio

- Add production Google, Meta/Instagram, WhatsApp and Razorpay credentials in Settings → Integrations.
- Reconnect existing Google accounts once so the added `drive.file` permission is granted.
- Obtain Meta approval for the WhatsApp payment-reminder template shown in the setup screen.
- Confirm the studio's final project templates, package prices, payment schedules, SAC codes and standard terms with the operating team/CA.
