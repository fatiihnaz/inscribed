/**
 * Contract for `lib/draft-queue.js`, the shared half of the three autosave
 * loops (CmsProvider's content saver, the collection editor, the composer).
 *
 * The queue owns timing and ordering and nothing else, so these tests are about
 * *when* a write runs and *in what order* — never about payloads, which stay
 * with the callers. Ordering is the case that matters most: two of the three
 * loops had no such guarantee, so a fast typist could leave one request in
 * flight while the next fired and have the older payload land last.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

import { createDraftQueue } from "../lib/draft-queue.js";

/**
 * Flushes that never settle on their own, so a test can hold one request in
 * flight and watch what the queue does with the next.
 */
function deferredFlushes() {
  /** @type {{ key: string, settle: () => void, fail: (err?: *) => void, ctx: * }[]} */
  const calls = [];
  /** @param {string} key */
  const make = (key) => (ctx) =>
    new Promise((resolve, reject) => {
      calls.push({ key, ctx, settle: () => resolve(undefined), fail: (e) => reject(e ?? new Error("nope")) });
    });
  return { make, calls };
}

/** Let promise continuations run without moving the clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("debounce", () => {
  it("collapses rapid schedules on one key into a single flush", async () => {
    const queue = createDraftQueue();
    const flush = vi.fn();

    queue.schedule("a", flush);
    await vi.advanceTimersByTimeAsync(400);
    queue.schedule("a", flush);
    await vi.advanceTimersByTimeAsync(400);
    queue.schedule("a", flush);
    await vi.advanceTimersByTimeAsync(999);
    expect(flush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("runs the flush handed to the last schedule, not the first", async () => {
    // The caller builds its payload inside the flush, so the newest closure is
    // the one that sees the current state.
    const queue = createDraftQueue();
    const stale = vi.fn();
    const fresh = vi.fn();

    queue.schedule("a", stale);
    queue.schedule("a", fresh);
    await vi.advanceTimersByTimeAsync(1000);

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("keeps a custom delay", async () => {
    const queue = createDraftQueue({ delay: 50 });
    const flush = vi.fn();
    queue.schedule("a", flush);
    await vi.advanceTimersByTimeAsync(50);
    expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe("ordering", () => {
  it("holds a second write on one key until the first settles", async () => {
    const queue = createDraftQueue();
    const { make, calls } = deferredFlushes();

    queue.schedule("a", make("first"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);

    queue.schedule("a", make("second"));
    await vi.advanceTimersByTimeAsync(1000);
    // Still one: the second is queued behind a request that hasn't come back.
    expect(calls).toHaveLength(1);

    calls[0].settle();
    await settle();
    expect(calls.map((c) => c.key)).toEqual(["first", "second"]);
  });

  it("does not strand the chain when a write fails", async () => {
    const queue = createDraftQueue();
    const { make, calls } = deferredFlushes();

    queue.schedule("a", make("first"));
    await vi.advanceTimersByTimeAsync(1000);
    queue.schedule("a", make("second"));
    await vi.advanceTimersByTimeAsync(1000);

    calls[0].fail();
    await settle();
    expect(calls.map((c) => c.key)).toEqual(["first", "second"]);
  });

  it("lets different keys run at the same time", async () => {
    const queue = createDraftQueue();
    const { make, calls } = deferredFlushes();

    queue.schedule("a", make("a"));
    queue.schedule("b", make("b"));
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls.map((c) => c.key).sort()).toEqual(["a", "b"]);
  });

  it("orders an enqueued write behind a scheduled one on the same key", async () => {
    // What a discard does: its DELETE must not overtake a PUT already in flight.
    const queue = createDraftQueue();
    const { make, calls } = deferredFlushes();

    queue.schedule("a", make("put"));
    await vi.advanceTimersByTimeAsync(1000);
    queue.enqueue("a", make("delete"));
    await settle();
    expect(calls.map((c) => c.key)).toEqual(["put"]);

    calls[0].settle();
    await settle();
    expect(calls.map((c) => c.key)).toEqual(["put", "delete"]);
  });
});

describe("cancel", () => {
  it("drops a pending write", async () => {
    const queue = createDraftQueue();
    const flush = vi.fn();

    queue.schedule("a", flush);
    queue.cancel("a");
    await vi.advanceTimersByTimeAsync(1000);

    expect(flush).not.toHaveBeenCalled();
  });

  it("marks an in-flight write stale so its caller skips the write-back", async () => {
    const queue = createDraftQueue();
    const { make, calls } = deferredFlushes();

    queue.schedule("a", make("a"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls[0].ctx.isStale()).toBe(false);

    queue.cancel("a");
    expect(calls[0].ctx.isStale()).toBe(true);
  });

  it("leaves other keys alone", async () => {
    const queue = createDraftQueue();
    const flush = vi.fn();

    queue.schedule("a", vi.fn());
    queue.schedule("b", flush);
    queue.cancel("a");
    await vi.advanceTimersByTimeAsync(1000);

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("cancelAll drops every pending write and staleness reaches in-flight ones", async () => {
    const queue = createDraftQueue();
    const { make, calls } = deferredFlushes();
    const pending = vi.fn();

    queue.schedule("a", make("a"));
    await vi.advanceTimersByTimeAsync(1000);
    queue.schedule("b", pending);

    queue.cancelAll();
    await vi.advanceTimersByTimeAsync(1000);

    expect(pending).not.toHaveBeenCalled();
    expect(calls[0].ctx.isStale()).toBe(true);
  });

  it("lets a key be used again after a cancel", async () => {
    const queue = createDraftQueue();
    const flush = vi.fn();

    queue.schedule("a", vi.fn());
    queue.cancel("a");
    queue.schedule("a", flush);
    await vi.advanceTimersByTimeAsync(1000);

    expect(flush).toHaveBeenCalledTimes(1);
    // The write that follows a cancel is not itself stale.
    expect(flush.mock.calls[0][0].isStale()).toBe(false);
  });
});

describe("rename", () => {
  it("drops a pending write on the old key", async () => {
    // The composer's slot stops describing anything once the record exists, so
    // firing a queued write against it would stash a phantom draft.
    const queue = createDraftQueue();
    const flush = vi.fn();

    queue.schedule("new:news", flush);
    queue.rename("new:news", "item:news:q1");
    await vi.advanceTimersByTimeAsync(1000);

    expect(flush).not.toHaveBeenCalled();
  });

  it("queues the new key behind a write still in flight on the old one", async () => {
    const queue = createDraftQueue();
    const { make, calls } = deferredFlushes();

    queue.schedule("new:news", make("create-draft"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);

    queue.rename("new:news", "item:news:q1");
    queue.schedule("item:news:q1", make("record-draft"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);

    calls[0].settle();
    await settle();
    expect(calls.map((c) => c.key)).toEqual(["create-draft", "record-draft"]);
  });

  it("frees the old key for a fresh record", async () => {
    const queue = createDraftQueue();
    const flush = vi.fn();

    queue.schedule("new:news", vi.fn());
    queue.rename("new:news", "item:news:q1");
    queue.schedule("new:news", flush);
    await vi.advanceTimersByTimeAsync(1000);

    expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe("dispose", () => {
  it("drops pending writes and marks in-flight ones stale", async () => {
    const queue = createDraftQueue();
    const { make, calls } = deferredFlushes();
    const pending = vi.fn();

    queue.schedule("a", make("a"));
    await vi.advanceTimersByTimeAsync(1000);
    queue.schedule("b", pending);

    queue.dispose();
    await vi.advanceTimersByTimeAsync(1000);

    expect(pending).not.toHaveBeenCalled();
    expect(calls[0].ctx.isStale()).toBe(true);
  });
});
