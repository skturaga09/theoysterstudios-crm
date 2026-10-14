# The Oyster Studios — Studio CRM

Monorepo: pnpm workspaces + Turborepo.

```
apps/web          React 19 + Vite + Tailwind v4 SPA
apps/api          Fastify (stub — M3)
apps/worker       Pub/Sub consumers (stub — M4)
packages/shared   domain types, ₹ lakh/crore + IST date formatters, zod schemas (/schemas)
packages/ui       tokens.css, motion.ts, restyled components
infra             Terraform (M7)
reference         client mockup + prototype (not shipped)
```

## Run

Fastest on macOS (installs Node 22 via Homebrew if needed, then starts the app):

```bash
bash ~/Pinnacle-CRM/scripts/setup-and-run.sh
```

Or manually:

Requires Node 22+ and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev:web          # http://localhost:5173  → open /styleguide
pnpm typecheck
pnpm test
```

## Shortcuts
`⌘K / Ctrl K` command menu · `g h` Home · `g i` Inbox · `g p` Pipeline · `Esc` closes overlays.

See `DECISIONS.md` for choices made against the brief.

## Deploy

Live at https://theoysterstudios-crm-staging.web.app. To publish the current code (website + API):

```bash
firebase deploy --only functions:api,hosting
```

Secrets (database connection, admin and support emails) are in Google Secret Manager — see DECISIONS.md → Hosting.
