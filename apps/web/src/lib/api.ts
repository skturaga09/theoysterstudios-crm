import { toast } from "@pinnacle/ui";
import { auth } from "./firebase";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; email?: string } | undefined,
  ) {
    super(body?.error ?? `Request failed (${status})`);
  }
}

/** Calls the CRM API with the signed-in person's Google ID token (refreshed automatically when it expires). */
export async function api<T>(path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body !== undefined && { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/** Saves in the background after an optimistic update; if the save fails, undoes the change and says so. */
export function save(request: Promise<unknown>, rollback: () => void) {
  request.catch((e: Error) => {
    rollback();
    toast(`Couldn't save — ${e.message}. Your change was undone.`);
  });
}
