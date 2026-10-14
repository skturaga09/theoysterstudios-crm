# Operations

Project: `theoysterstudios-crm-staging` (Firebase, Blaze plan). Live site: https://theoysterstudios-crm-staging.web.app

## One-time setup: alerts (about 10 minutes, Google Cloud console)

Alerts go to the project owner's email. They live in Google Cloud, never in the CRM.

### 1. Budget alert: tells you if costs climb

1. Open https://console.cloud.google.com/billing and pick the billing account linked to the project.
2. **Budgets & alerts → Create budget**.
3. Scope: project **theoysterstudios-crm-staging**.
4. Amount: a monthly figure you'd never expect to reach, e.g. **₹1,000**.
5. Thresholds: **50%, 90%, 100%** of actual spend; tick "Email alerts to billing admins".

A budget only alerts; it never stops the site.

### 2. Down alert: tells you if the site stops answering

1. Open https://console.cloud.google.com/monitoring/uptime → **Create uptime check**.
2. Protocol **HTTPS**, host `theoysterstudios-crm-staging.web.app`, path `/api/healthz`, check every **5 minutes**.
3. Response must contain `"ok":true`.
4. Create the alert it offers, with your email as the notification channel.

`/api/healthz` answers only after the backend has reached the database, so this also catches database trouble.

### 3. Error alert: tells you if the backend starts failing

1. Open https://console.cloud.google.com/logs/query and run:
   ```
   resource.type="cloud_run_revision"
   resource.labels.service_name="api"
   severity>=ERROR
   ```
2. **Actions → Create log alert**: name it "CRM API errors", notify at most **once per hour**, with your email as the channel.

## Routine tasks

| Task | How |
|---|---|
| Publish the current code | `firebase deploy --only functions:api,hosting` |
| Change a secret (database password, admin or support emails) | `firebase functions:secrets:set MONGODB_URI` (or `ADMIN_EMAIL`, `SUPPORT_EMAILS`), then redeploy |
| Restore the database | Firebase console → Firestore → `oyster-crm` → Disaster recovery: point-in-time (last 7 days) or a daily backup (kept 14 days) |
| Instagram access | Renewed automatically by the `daily` function (03:00 IST). If Instagram shows "Needs attention", an admin clicks Reconnect on Settings → Integrations |
| See backend logs | https://console.cloud.google.com/run → service `api` → Logs |
| Run the tests against Firestore | `cd apps/api && pnpm test:firestore` (uses `oyster-crm-test`, never the live database) |
