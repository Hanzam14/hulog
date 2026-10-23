import { useSyncExternalStore } from "react";
import { rpc, sessionUserId } from "./data";
import { isNavigatorOffline } from "./helpers";
import { isSoloMode } from "./solo";

/**
 * Offline recording (SPEC 10.11). A queued item is only a record waiting to be
 * written; it is never a payment and never part of any total. Every send
 * carries the item's id as `p_client_request_id`, so a retry after a lost
 * response cannot record twice.
 */
export type OutboxKind = "payment" | "abono";
export type OutboxState = "queued" | "sending" | "failed";
export interface OutboxItem {
  /** The client_request_id: generated once, reused on every retry. */
  id: string;
  kind: OutboxKind;
  args: Record<string, unknown>;
  createdAt: string;
  state: OutboxState;
  error?: string;
}
export interface SubmitRequest {
  kind: OutboxKind;
  args: Record<string, unknown>;
  /** Key for this attempt; omit to generate one. */
  id?: string;
}
export type SubmitResult =
  | { status: "sent"; id: string; result: unknown }
  | { status: "queued"; id: string };
export interface FlushResult {
  sent: number;
  failed: number;
}

const STORAGE_PREFIX = "hulog-outbox:";
const LOCK_NAME = "hulog-outbox-flush";
const RPC_NAME: Record<OutboxKind, string> = {
  payment: "record_payment",
  abono: "record_abono_entry",
};
const EMPTY: OutboxItem[] = [];

export function newRequestId(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    )
      return crypto.randomUUID();
  } catch {
    /* randomUUID needs a secure context; fall through. */
  }
  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  )
    crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A verdict from the database or the API: a SQLSTATE or PostgREST code. */
function hasServerCode(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^([0-9A-Z]{5}|PGRST\d{3})$/.test(code);
}
/**
 * Not a rule error: a temporary server or connection problem, or a session
 * that is not valid right now. The same request can be retried safely.
 */
function isRetryableCode(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === "string" &&
    /^(PGRST30[123]|PGRST00[0-3]|08[0-9A-Z]{3}|40001|40P01|53[0-9A-Z]{3}|57[0-9A-Z]{3}|42501)$/.test(
      code,
    )
  );
}
/** The request may or may not have reached the server: retry with the same key. */
export function isNetworkError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (hasServerCode(error)) return false;
  const e = error as { name?: unknown; message?: unknown };
  return (
    e.name === "TypeError" ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|network error|timed? ?out|aborted|connection|offline/i.test(
      String(e.message ?? ""),
    )
  );
}

// Storage is best effort: the in-memory copy keeps this session working when
// localStorage is blocked, full or throwing.
const memory = new Map<string, OutboxItem[]>();
let version = 0;
let cache: { userId: string; version: number; items: OutboxItem[] } | null =
  null;
const listeners = new Set<() => void>();
function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}
function onStorage(event: StorageEvent) {
  if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) emit();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined")
    window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined")
      window.removeEventListener("storage", onStorage);
  };
}
function validItem(value: unknown): value is OutboxItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id !== "" &&
    (v.kind === "payment" || v.kind === "abono") &&
    typeof v.args === "object" &&
    v.args !== null &&
    typeof v.createdAt === "string" &&
    (v.state === "queued" || v.state === "sending" || v.state === "failed")
  );
}
function read(userId: string): OutboxItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed.filter(validItem) : [];
      memory.set(userId, items);
      return items;
    }
  } catch {
    /* Fall back to the in-memory copy. */
  }
  return memory.get(userId) ?? [];
}
function write(userId: string, items: OutboxItem[]) {
  memory.set(userId, items);
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(items));
  } catch {
    /* Still queued in memory for this session. */
  }
}
function mutate(userId: string, change: (items: OutboxItem[]) => OutboxItem[]) {
  write(userId, change(read(userId)));
  emit();
}
function patch(userId: string, id: string, fields: Partial<OutboxItem>) {
  mutate(userId, (items) =>
    items.map((item) => (item.id === id ? { ...item, ...fields } : item)),
  );
}

/** Stable snapshot of one user's queue (same array until something changes). */
export function outboxItems(userId: string): OutboxItem[] {
  if (cache && cache.userId === userId && cache.version === version)
    return cache.items;
  const items = read(userId);
  cache = { userId, version, items };
  return items;
}
export function useOutbox(userId: string | null): OutboxItem[] {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? outboxItems(userId) : EMPTY),
    () => EMPTY,
  );
}
function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
export function useOffline(): boolean {
  return useSyncExternalStore(subscribeOnline, isNavigatorOffline, () => false);
}
/** Offline and recording would wait on this phone (never true in solo mode). */
export function useQueueingOffline(): boolean {
  const offline = useOffline();
  return offline && !isSoloMode();
}

/** The RPC arguments always include the optional ones the keyed call requires. */
function buildArgs(
  kind: OutboxKind,
  args: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const note = typeof args.p_note === "string" ? args.p_note : "";
  // The server picks the overload from the argument names, so a reference is
  // sent only when there is one (SPEC 10.14); without it the old form is used.
  const { p_proof_ref: proofRef, ...rest } = args;
  const withRef =
    typeof proofRef === "string" && proofRef.trim()
      ? { p_proof_ref: proofRef.trim() }
      : {};
  return kind === "payment"
    ? { ...rest, ...withRef, p_note: note, p_client_request_id: id }
    : {
        ...rest,
        ...withRef,
        p_entry_date: args.p_entry_date ?? null,
        p_note: note,
        p_client_request_id: id,
      };
}

/**
 * Send a record now, or queue it. Queues only when the browser reports offline
 * or the call fails with a network error; a rule error from the server is
 * thrown and never queued. Solo mode has no outbox.
 */
export async function submitRecord(
  userId: string,
  request: SubmitRequest,
): Promise<SubmitResult> {
  const id = request.id ?? newRequestId();
  const send = () =>
    rpc(RPC_NAME[request.kind], buildArgs(request.kind, request.args, id));
  if (isSoloMode()) return { status: "sent", id, result: await send() };
  const enqueue = (): SubmitResult => {
    mutate(userId, (items) =>
      items.some((item) => item.id === id)
        ? items
        : [
            ...items,
            {
              id,
              kind: request.kind,
              args: request.args,
              createdAt: new Date().toISOString(),
              state: "queued",
            },
          ],
    );
    return { status: "queued", id };
  };
  if (isNavigatorOffline()) return enqueue();
  try {
    return { status: "sent", id, result: await send() };
  } catch (error) {
    if (isNetworkError(error)) return enqueue();
    throw error;
  }
}
export function isQueuedResult(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "queued"
  );
}

let flushing = false;
async function withFlushLock<T>(
  work: () => Promise<T>,
  skipped: T,
): Promise<T> {
  if (flushing) return skipped;
  flushing = true;
  try {
    const locks =
      typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks && typeof locks.request === "function") {
      try {
        return await locks.request(
          LOCK_NAME,
          { ifAvailable: true },
          async (lock) => (lock ? work() : skipped),
        );
      } catch {
        /* Locks unavailable here; the in-memory flag still guards this tab. */
      }
    }
    return await work();
  } finally {
    flushing = false;
  }
}

/**
 * Send this user's queued items one at a time, oldest first. A rule error
 * keeps the item as failed (never retried by itself); a network error leaves
 * it queued and stops. Only the signed-in user's own queue is ever touched.
 */
export function flushOutbox(userId: string): Promise<FlushResult> {
  const none: FlushResult = { sent: 0, failed: 0 };
  if (!userId || isSoloMode() || isNavigatorOffline())
    return Promise.resolve(none);
  return withFlushLock(async () => {
    const result: FlushResult = { sent: 0, failed: 0 };
    // We hold the lock, so nobody is still sending an item left as "sending".
    mutate(userId, (items) =>
      items.map((item) =>
        item.state === "sending" ? { ...item, state: "queued" } : item,
      ),
    );
    for (;;) {
      const next = read(userId).find((item) => item.state === "queued");
      if (!next) break;
      // Never send under another account (or none): the server takes the
      // actor from the live session, not from this queue's owner.
      if ((await sessionUserId()) !== userId) break;
      patch(userId, next.id, { state: "sending" });
      try {
        await rpc(
          RPC_NAME[next.kind],
          buildArgs(next.kind, next.args, next.id),
        );
        mutate(userId, (items) => items.filter((item) => item.id !== next.id));
        result.sent += 1;
      } catch (error) {
        if (hasServerCode(error) && !isRetryableCode(error)) {
          patch(userId, next.id, {
            state: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
          result.failed += 1;
          continue;
        }
        patch(userId, next.id, { state: "queued" });
        break;
      }
    }
    return result;
  }, none);
}

/** Put a failed item back in the queue; it keeps its id, so a retry cannot double-record. */
export function retryItem(userId: string, id: string) {
  mutate(userId, (items) =>
    items.map((item) =>
      item.id === id && item.state === "failed"
        ? {
            id: item.id,
            kind: item.kind,
            args: item.args,
            createdAt: item.createdAt,
            state: "queued",
          }
        : item,
    ),
  );
}

/** Remove an item the user chose to throw away (never one being sent). */
export function discardItem(userId: string, id: string) {
  mutate(userId, (items) =>
    items.filter((item) => item.id !== id || item.state === "sending"),
  );
}
