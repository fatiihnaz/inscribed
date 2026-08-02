/**
 * @file Keyed debounced queue for draft autosave. Mechanism only: it owns
 * *when* a write runs and *in what order*, never what the write is.
 *
 * Three autosave loops had grown their own copies of the debounce, and only one
 * of them had the ordering guarantee. Without it a fast typist can leave one PUT
 * in flight while the next fires, and the older payload can land last, silently
 * reverting what was just typed.
 *
 * Deliberately left to callers, because the three disagree and should:
 * what the payload is, whether it is worth sending at all (the editor compares
 * against its own view of the server), what to do with the result, and how the
 * UI reports progress.
 */

/** @typedef {{ isStale: () => boolean }} FlushContext */

/**
 * @typedef {Object} DraftQueue
 * @property {(key: string, flush: (ctx: FlushContext) => Promise<void> | void) => void} schedule
 * @property {(key: string, run: () => Promise<void> | void) => void} enqueue
 * @property {(key: string) => void} cancel
 * @property {() => void} cancelAll
 * @property {(from: string, to: string) => void} rename
 * @property {() => void} dispose
 */

const noop = () => {};

/**
 * @param {{ delay?: number }} [options]
 * @returns {DraftQueue}
 */
export function createDraftQueue({ delay = 1000 } = {}) {
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const timers = new Map();
  /** Tail of each key's request chain, so writes to one key never overlap. */
  /** @type {Map<string, Promise<void>>} */
  const chains = new Map();
  /** Bumped by `cancel`, so a write already in flight can tell it is stale. */
  /** @type {Map<string, number>} */
  const epochs = new Map();
  let globalEpoch = 0;

  /** @param {string} key */
  const epochOf = (key) => epochs.get(key) ?? 0;

  /**
   * Append to the key's chain. The `catch` is what keeps a failed write from
   * stranding everything queued behind it.
   *
   * @param {string} key
   * @param {() => Promise<void> | void} run
   */
  function chain(key, run) {
    const previous = chains.get(key) ?? Promise.resolve();
    const next = previous.catch(noop).then(run);
    chains.set(key, next);
    next.catch(noop).then(() => {
      // Only the tail clears the slot: a later write may already have chained
      // onto this one, and dropping it would let the next write race it.
      if (chains.get(key) === next) chains.delete(key);
    });
  }

  return {
    schedule(key, flush) {
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        timers.delete(key);
        // Captured at fire time, not at schedule time: a cancel between the two
        // already dropped this timer, so what matters is staleness from here on.
        const keyEpoch = epochOf(key);
        const startEpoch = globalEpoch;
        chain(key, () =>
          flush({ isStale: () => epochOf(key) !== keyEpoch || globalEpoch !== startEpoch }),
        );
      }, delay);

      timers.set(key, timer);
    },

    enqueue(key, run) {
      chain(key, run);
    },

    cancel(key) {
      const timer = timers.get(key);
      if (timer) {
        clearTimeout(timer);
        timers.delete(key);
      }
      epochs.set(key, epochOf(key) + 1);
    },

    cancelAll() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      globalEpoch += 1;
    },

    rename(from, to) {
      // A pending write against the old key is dropped rather than re-aimed:
      // after a create the new-item slot no longer describes anything, so
      // firing it would stash a draft the next composer mount seeds from.
      const timer = timers.get(from);
      if (timer) {
        clearTimeout(timer);
        timers.delete(from);
      }
      // An in-flight write is left to finish, and the new key queues behind it,
      // so the record's first write can't overtake the create it depends on.
      const inFlight = chains.get(from);
      if (inFlight) {
        chain(to, () => inFlight.catch(noop));
        chains.delete(from);
      }
      epochs.delete(from);
    },

    dispose() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      chains.clear();
      globalEpoch += 1;
    },
  };
}
