/**
 * Client photos (the couple's or the brand's picture on their card). Kept small in the CRM's own database and
 * served from an unguessable address, like a private cloud-storage link: no sign-in needed to show the image,
 * nothing to find without the link. Each upload gets a new address, so it can be cached for good.
 */
import { randomBytes } from "node:crypto";
import { Binary, type Db } from "mongodb";

export const PHOTO_PATH = "/api/public/photos/";
export type Photo = { _id: string; type: string; data: Binary; bytes: number; createdAt: string };
const MAX_BYTES = 400_000; // the browser shrinks uploads to ~50 KB; this only stops abuse

/** What a file's first bytes say it is — trust these, not the name or the claimed type. */
function sniff(b: Buffer): string | undefined {
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return undefined;
}

/** Stores an image (WebP, JPEG or PNG, up to 400 KB) and returns its address. Throws a readable error otherwise. */
export async function savePhoto(db: Db, bytes: Buffer): Promise<string> {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("The photo must be under 400 KB");
  const type = sniff(bytes);
  if (!type) throw new Error("Use a JPEG, PNG or WebP photo");
  const _id = randomBytes(24).toString("base64url");
  await db.collection<Photo>("photos").insertOne({ _id, type, data: new Binary(bytes), bytes: bytes.length, createdAt: new Date().toISOString() });
  return `${PHOTO_PATH}${_id}`;
}

/** `data:image/webp;base64,…` → bytes, or undefined if it isn't one. */
export function fromDataUrl(dataUrl: string): Buffer | undefined {
  const m = dataUrl.match(/^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
  return m ? Buffer.from(m[2]!, "base64") : undefined;
}

export async function deletePhoto(db: Db, path?: unknown) {
  if (typeof path === "string" && path.startsWith(PHOTO_PATH)) await db.collection<Photo>("photos").deleteOne({ _id: path.slice(PHOTO_PATH.length) });
}

/** Downloads an image from a URL we were given by Instagram and keeps a copy (their links expire). Best effort. */
export async function copyRemotePhoto(db: Db, f: typeof fetch, url: string): Promise<string | undefined> {
  try {
    const res = await f(url);
    if (!res.ok) return undefined;
    return await savePhoto(db, Buffer.from(await res.arrayBuffer()));
  } catch {
    return undefined;
  }
}
