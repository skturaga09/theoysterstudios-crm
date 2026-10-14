/** API entry. Every route except /healthz needs a Google sign-in on the team list (see app.ts). */
import { buildApp } from "./app";
import { ensureAdmin, firebaseVerifier } from "./auth";
import { connect } from "./db";

const { MONGODB_URI, FIREBASE_PROJECT_ID, ADMIN_EMAIL, SUPPORT_EMAILS, PORT = "8080" } = process.env;
if (!MONGODB_URI || !FIREBASE_PROJECT_ID) {
  console.error("Set MONGODB_URI and FIREBASE_PROJECT_ID — see apps/api/.env.example");
  process.exit(1);
}

const { client, db } = await connect(MONGODB_URI);
// Comma-separated; each address is made an admin if it isn't on the team yet.
for (const email of ADMIN_EMAIL?.split(",").map((e) => e.trim()).filter(Boolean) ?? []) await ensureAdmin(db, email);
const app = buildApp({ db, client, verify: firebaseVerifier(FIREBASE_PROJECT_ID), supportEmails: SUPPORT_EMAILS?.split(",").filter(Boolean) });
app.listen({ port: Number(PORT), host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
