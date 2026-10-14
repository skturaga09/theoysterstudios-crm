/**
 * Cloud Functions (2nd gen, runs on Cloud Run) entry. Firebase Hosting forwards /api/** here.
 * Settings come from Secret Manager: `firebase functions:secrets:set MONGODB_URI` (and ADMIN_EMAIL, SUPPORT_EMAILS).
 */
import type { FastifyInstance } from "fastify";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { Db } from "mongodb";
import { buildApp } from "./app";
import { ensureAdmin, firebaseVerifier } from "./auth";
import { connect } from "./db";
import { refreshToken } from "./instagram";

const MONGODB_URI = defineSecret("MONGODB_URI");
const ADMIN_EMAIL = defineSecret("ADMIN_EMAIL");
const SUPPORT_EMAILS = defineSecret("SUPPORT_EMAILS");
const list = (v: string) => v.split(",").map((e) => e.trim()).filter(Boolean);

// One database connection pool and one app per instance, reused across requests.
let conn: ReturnType<typeof connect> | undefined;
const getDb = () =>
  (conn ??= connect(MONGODB_URI.value()).catch((e) => {
    conn = undefined; // let the next call retry instead of caching the failure
    throw e;
  }));
let app: Promise<FastifyInstance> | undefined;
const getApp = () =>
  (app ??= (async () => {
    const { client, db } = await getDb();
    for (const email of list(ADMIN_EMAIL.value())) await ensureAdmin(db, email);
    const fastify = buildApp({ db, client, verify: firebaseVerifier(process.env.GCLOUD_PROJECT!), supportEmails: list(SUPPORT_EMAILS.value()), preParsedBody: true });
    await fastify.ready();
    return fastify;
  })().catch((e) => {
    app = undefined; // let the next request retry instead of caching the failure
    throw e;
  }));

export const api = onRequest(
  {
    region: "asia-south1", // Mumbai, next to the Firestore database
    secrets: [MONGODB_URI, ADMIN_EMAIL, SUPPORT_EMAILS],
    invoker: "public", // sign-in is checked inside the app
    memory: "512MiB",
    concurrency: 40,
    maxInstances: 3, // a 4–5 person team needs one; the cap bounds cost if something loops
    timeoutSeconds: 60,
  },
  async (req, res) => (await getApp()).routing(req, res),
);

/** Daily: renew the Instagram access token (valid 60 days) well before it lapses. */
export const daily = onSchedule(
  { schedule: "every day 03:00", timeZone: "Asia/Kolkata", region: "asia-south1", secrets: [MONGODB_URI], memory: "256MiB", timeoutSeconds: 120 },
  async () => {
    const { db }: { db: Db } = await getDb();
    console.log("instagram token:", await refreshToken(db, fetch));
  },
);
