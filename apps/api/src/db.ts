import { MongoClient, type Db, type IndexDescription } from "mongodb";

/** Documents keep the web app's string ids as `_id`, so API responses match `apps/web/src/data/types.ts`. */
export type Doc = { _id: string } & Record<string, unknown>;

/**
 * Targets Firestore with MongoDB compatibility (works on plain MongoDB too).
 * The database comes from the URI path — a Firestore connection is bound to one database.
 */
export async function connect(uri: string) {
  // ignoreUndefined: never store `email: null`, which would break the sparse unique index.
  const client = new MongoClient(uri, { appName: "oyster-crm-api", ignoreUndefined: true, retryWrites: false });
  await client.connect();
  const db = client.db();
  await ensureIndexes(db);
  return { client, db };
}

const INDEXES: Record<string, IndexDescription[]> = {
  companies: [{ key: { name: 1 } }, { key: { ownerId: 1 } }],
  // One contact per email; sparse lets contacts without an email repeat. (Firestore has no partial indexes.)
  contacts: [{ key: { companyId: 1 } }, { key: { ownerId: 1 } }, { key: { email: 1 }, unique: true, sparse: true }],
  deals: [{ key: { stage: 1, position: 1 } }, { key: { companyId: 1 } }, { key: { ownerId: 1 } }],
  members: [{ key: { email: 1 }, unique: true }],
  tasks: [{ key: { assigneeId: 1, done: 1 } }, { key: { dealId: 1 } }],
  activities: [{ key: { at: -1 } }, { key: { dealId: 1, at: -1 } }],
  conversations: [{ key: { channel: 1, externalId: 1 }, unique: true }, { key: { lastMessageAt: -1 } }],
  invoices: [{ key: { number: 1 }, unique: true }, { key: { companyId: 1 } }, { key: { dueAt: 1 } }],
};

/**
 * Creates only missing indexes. Firestore takes ~75s per index build and accepts one index per
 * createIndex call, so we skip existing ones and build the rest in parallel.
 */
export async function ensureIndexes(db: Db) {
  await Promise.all(
    Object.entries(INDEXES).map(async ([name, specs]) => {
      const col = db.collection(name);
      // listIndexes fails on a collection that doesn't exist yet → nothing exists.
      const have = new Set((await col.listIndexes().toArray().catch(() => [])).map((i) => JSON.stringify(i.key)));
      await Promise.all(specs.filter((s) => !have.has(JSON.stringify(s.key))).map(({ key, ...opts }) => col.createIndex(key, opts)));
    }),
  );
}
