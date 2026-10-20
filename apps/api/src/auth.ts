import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { ObjectId, type Db } from "mongodb";
import type { Role } from "@pinnacle/shared";

export type Claims = { email?: string; email_verified?: boolean; name?: string; picture?: string };
export type Verify = (idToken: string) => Promise<Claims>;

/**
 * Verifies Firebase ID tokens (Google sign-in) against Google's public keys — no service account needed.
 * Revocation isn't checked; removing someone from the team list blocks them on their next request instead.
 */
export function firebaseVerifier(projectId: string): Verify {
  const auth = getAuth(initializeApp({ projectId }, "verify"));
  return (token) => auth.verifyIdToken(token);
}

export type Member = {
  _id: string;
  email: string;
  name: string;
  role: Role;
  title: string;
  status: "invited" | "active" | "removed";
  addedAt: string;
  lastSignInAt?: string;
  photoURL?: string;
};

/**
 * The application's own support login (the developer). Signs in as an admin but is never stored in `members`,
 * never listed on the team and never returns their address — so it can't be picked as an owner or removed by the client.
 */
export const SUPPORT_MEMBER: Member = { _id: "support", email: "", name: "Support", role: "admin", title: "Application support", status: "active", addedAt: "1970-01-01T00:00:00.000Z" };

/** "riya.v@gmail.com" → "Riya V" */
export const nameFromEmail = (email: string) => email.split("@")[0]!.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Makes sure the first admin exists, so a fresh database isn't locked out. Never changes an existing member. */
export async function ensureAdmin(db: Db, email: string) {
  const addr = email.trim().toLowerCase();
  await db.collection<Member>("members").updateOne(
    { email: addr },
    { $setOnInsert: { _id: new ObjectId().toHexString(), email: addr, name: nameFromEmail(addr), role: "admin", title: "—", status: "invited", addedAt: new Date().toISOString() } },
    { upsert: true },
  );
}
