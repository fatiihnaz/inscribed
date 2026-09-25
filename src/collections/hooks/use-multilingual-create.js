"use client";

/**
 * @file `useMultilingualCreate`: one new record written in several languages at
 * once. Each language is its own row in the backend, with its own slug and its
 * own new-item draft slot, so the languages are created one after another and
 * every one after the first joins the first one's translation group.
 *
 * Prose fields (`TRANSLATABLE_TYPES`) are held per language. Every other field
 * is asked once and written into each language's record: a cover image or a
 * date is the same news in both.
 *
 * `useCollectionCreate` stays the single-language flow.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { useCollectionContext } from "../context.js";
import { itemDraftKey, newDraftKey } from "../../shared/state/draft-keys.js";
import { localeCodes } from "../../shared/util/locale-codes.js";
import { stableStringify } from "../../shared/util/stable-stringify.js";
import { TRANSLATABLE_TYPES } from "../../shared/util/translatable.js";
import { seedValues, buildPayload, requiredMissing } from "../record-payload.js";
import { createRecord, createErrorMessage } from "../create-record.js";
import { useCollectionMeta } from "./use-my-collections.js";
import { usePendingDrafts } from "./use-pending-drafts.js";

/**
 * @import { CollectionItemResponse, CollectionListParams, CollectionSchema } from "../../shared/contracts/schemas.js"
 */

/**
 * @typedef {{ state: "ready" } | { state: "missing", field: string } | { state: "created" }} LanguageStatus
 */

/**
 * @typedef {Object} MultilingualCreateState
 * @property {string[]} added
 *   The languages this record is being written in, in the collection's order.
 * @property {(locale: string) => void} add
 * @property {(locale: string) => void} remove
 *   Takes the language out of this record, along with its half-finished draft.
 * @property {(locale: string) => Record<string, *>} valuesFor
 * @property {(locale: string, name: string, value: *) => void} setField
 *   A prose field goes to that language's own copy, any other to every language.
 * @property {(locale: string) => string} slugFor
 * @property {(locale: string, slug: string) => void} setSlug
 * @property {(locale: string) => LanguageStatus} statusOf
 * @property {(locale: string) => boolean} hasDraft
 *   Whether the language has a half-finished draft on the server.
 * @property {boolean} sharedLocked
 *   True once a language has been created: its record already carries the
 *   shared values, and the rest must match it.
 * @property {(onCreated?: (item: CollectionItemResponse, all: CollectionItemResponse[]) => void) => void} submit
 * @property {() => void} discard  Clear the form and the added languages' drafts.
 * @property {boolean} hasServerDraft
 * @property {boolean} isPending
 * @property {string | null} error
 */

/**
 * @param {Object} options
 * @param {string} options.collectionKey
 * @param {CollectionSchema} options.schema
 * @param {string[]} options.languages  What the collection holds, in its own order.
 * @param {string} options.primary
 *   The language the form opens in, the page's or the panel's. `onCreated`
 *   hands its record first.
 * @param {CollectionListParams} [options.listParams]  See `usePendingDrafts`.
 * @param {boolean} [options.active=true]  Autosave only while true.
 * @returns {MultilingualCreateState}
 */
export function useMultilingualCreate({ collectionKey, schema, languages, primary, listParams, active = true }) {
  const { config, getAccessToken, onAfterCollectionSave } = useCmsContext();
  const t = useCmsStrings();
  const { updateCollectionItem, patchCollectionPendingDraft, draftQueue } = useCollectionContext();
  const needsSlug = useCollectionMeta(collectionKey)?.slugSource === "UserDefined";
  const fields = schema.fields;

  // Read-only and computed fields never go on the wire, so they have no copy
  // to keep per language.
  const proseNames = useMemo(
    () => fields
      .filter((f) => TRANSLATABLE_TYPES.has(f.type) && !f.readOnly && !f.computed)
      .map((f) => f.name),
    [fields],
  );
  const blank = useMemo(() => seedValues(fields, {}), [fields]);
  const emptyPayload = useMemo(() => stableStringify(buildPayload(fields, blank)), [fields, blank]);

  const [added, setAdded] = useState(() => [primary]);
  // Every field, the prose ones included; each language's own prose sits on top.
  const [shared, setShared] = useState(() => blank);
  const [prose, setProse] = useState(() => /** @type {Map<string, Record<string, *>>} */ (new Map()));
  const [slugs, setSlugs] = useState(() => /** @type {Map<string, string>} */ (new Map()));
  const [created, setCreated] = useState(() => /** @type {Map<string, CollectionItemResponse>} */ (new Map()));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  // State rather than a transition: the languages go out one request after
  // another, and the form has to stay locked for all of them.
  const [isPending, setIsPending] = useState(false);

  const pending = usePendingDrafts(collectionKey, languages, listParams);

  /** @param {Record<string, *>} values */
  const pickProse = (values) => Object.fromEntries(proseNames.map((name) => [name, values[name]]));
  /** @param {string} locale */
  const valuesFor = (locale) => ({ ...shared, ...(prose.get(locale) ?? pickProse(blank)) });
  /** @param {string} locale */
  const slugFor = (locale) => slugs.get(locale) ?? "";

  // What each language's slot last took, and which languages have seeded.
  // Refs, because both only answer "has this happened yet" for the effects.
  const lastSynced = useRef(/** @type {Map<string, string>} */ (new Map()));
  const seeded = useRef(/** @type {Set<string>} */ (new Set()));

  // Each added language seeds once, from the first draft that arrives for it.
  useEffect(() => {
    for (const locale of added) {
      if (seeded.current.has(locale)) continue;
      const draft = pending.get(locale);
      if (!draft) continue;
      seeded.current.add(locale);
      lastSynced.current.set(locale, stableStringify(draft));
      const seed = seedValues(fields, draft);
      setProse((prev) => new Map(prev).set(locale, pickProse(seed)));
      // Shared values come from the form's own language only. Another
      // language's draft may be a different record started earlier, and must
      // not overwrite a cover image picked here.
      if (locale === primary) setShared(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [added, pending, fields, primary]);

  // Debounced autosave of each language into its own slot. A shared field is
  // part of every language's payload, so changing one rewrites every slot.
  useEffect(() => {
    if (!active || isPending) return;
    for (const locale of added) {
      if (created.has(locale)) continue;
      const payload = buildPayload(fields, valuesFor(locale));
      const serialized = stableStringify(payload);
      if (serialized === lastSynced.current.get(locale)) continue;
      // A language added and left untouched never writes a phantom draft.
      if (!lastSynced.current.has(locale) && serialized === emptyPayload) continue;
      draftQueue.schedule(newDraftKey(collectionKey, locale), async (ctx) => {
        try {
          const token = await getAccessToken();
          await config.transport.saveCollectionNewDraft(
            collectionKey,
            { data: payload },
            { accessToken: token, locale },
          );
          if (ctx.isStale()) return;
          lastSynced.current.set(locale, serialized);
          // Before the patch below, which the seeding effect reads: seeding
          // from it would drop whatever was typed while this was in flight.
          seeded.current.add(locale);
          patchCollectionPendingDraft(collectionKey, locale, payload);
        } catch (err) {
          if (ctx.isStale()) return;
          // eslint-disable-next-line no-console
          console.warn("[inscribed] collection new-draft autosave failed:", err);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, prose, added, created, active, isPending, collectionKey]);

  /**
   * @param {string} locale
   * @param {boolean} deleteSlot
   */
  const standDown = (locale, deleteSlot) => {
    const key = newDraftKey(collectionKey, locale);
    // A queued write would re-create the draft being dropped, so it goes
    // first; one already in flight is waited for, so the delete lands after.
    draftQueue.cancel(key);
    if (!deleteSlot) return;
    draftQueue.enqueue(key, async () => {
      try {
        const token = await getAccessToken();
        await config.transport.deleteCollectionNewDraft(collectionKey, { accessToken: token, locale });
        patchCollectionPendingDraft(collectionKey, locale, null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[inscribed] collection new-draft delete failed:", err);
      }
    });
  };

  const reset = () => {
    setAdded([primary]);
    setShared(blank);
    setProse(new Map());
    setSlugs(new Map());
    setCreated(new Map());
    setError(null);
    lastSynced.current = new Map();
    seeded.current = new Set();
  };

  /** @param {string} locale */
  const add = (locale) => {
    setError(null);
    setAdded((prev) => (prev.includes(locale)
      ? prev
      : languages.filter((l) => l === locale || prev.includes(l))));
  };

  /** @param {string} locale */
  const remove = (locale) => {
    if (added.length <= 1 || created.has(locale)) return;
    const hadDraft = pending.get(locale) != null || lastSynced.current.has(locale);
    setError(null);
    setAdded((prev) => prev.filter((l) => l !== locale));
    setProse((prev) => withoutKey(prev, locale));
    setSlugs((prev) => withoutKey(prev, locale));
    seeded.current.delete(locale);
    lastSynced.current.delete(locale);
    // Its half-finished text goes with it. Left in the slot, it would come back
    // as the draft the next time the language is added.
    standDown(locale, hadDraft);
  };

  /**
   * @param {string} locale
   * @param {string} name
   * @param {*} value
   */
  const setField = (locale, name, value) => {
    if (proseNames.includes(name)) {
      setProse((prev) => new Map(prev).set(locale, { ...(prev.get(locale) ?? pickProse(blank)), [name]: value }));
    } else {
      setShared((prev) => ({ ...prev, [name]: value }));
    }
  };

  /**
   * @param {string} locale
   * @param {string} slug
   */
  const setSlug = (locale, slug) => setSlugs((prev) => new Map(prev).set(locale, slug));

  /**
   * @param {string} locale
   * @returns {LanguageStatus}
   */
  const statusOf = (locale) => {
    if (created.has(locale)) return { state: "created" };
    const field = requiredMissing(fields, valuesFor(locale))
      ?? (needsSlug && !slugFor(locale).trim() ? t("collections.slugLabel") : null);
    return field ? { state: "missing", field } : { state: "ready" };
  };

  /** @param {(item: CollectionItemResponse, all: CollectionItemResponse[]) => void} [onCreated] */
  const submit = (onCreated) => {
    if (isPending) return;
    setError(null);
    const queue = added.filter((l) => !created.has(l));
    if (queue.length === 0) return;
    const several = added.length > 1;
    for (const locale of queue) {
      const code = locale.toUpperCase();
      const missing = requiredMissing(fields, valuesFor(locale));
      if (missing) {
        setError(several
          ? t("collections.requiredMissingIn", { locale: code, field: missing })
          : t("collections.requiredMissing", { field: missing }));
        return;
      }
      if (needsSlug && !slugFor(locale).trim()) {
        setError(several ? t("collections.slugMissingIn", { locale: code }) : t("collections.slugMissing"));
        return;
      }
    }
    setIsPending(true);
    (async () => {
      const done = new Map(created);
      // Every language after the first joins the first one's group. After a
      // failed attempt, the ones that landed already name it.
      let group = [...done.values()].map((item) => item.translationGroupId).find(Boolean) ?? undefined;
      for (const locale of queue) {
        try {
          const token = await getAccessToken();
          const item = await createRecord(config.transport, collectionKey, {
            data: buildPayload(fields, valuesFor(locale)),
            slug: needsSlug ? slugFor(locale).trim() : undefined,
            locale,
            translationGroup: group,
            accessToken: token,
          });
          done.set(locale, item);
          group ??= item.translationGroupId ?? undefined;
          // The same handover as a single-language create: the new-item slot
          // no longer describes anything, and the record's own lane inherits
          // whatever is still in flight.
          draftQueue.rename(newDraftKey(collectionKey, locale), itemDraftKey(collectionKey, item.slug));
          updateCollectionItem(collectionKey, item.slug, item);
          // As each one lands rather than at the end: if a later language
          // fails, this one is live all the same.
          try {
            await onAfterCollectionSave(collectionKey, item.slug);
          } catch (revalidateErr) {
            // eslint-disable-next-line no-console
            console.warn("[inscribed] onAfterCollectionSave failed:", revalidateErr);
          }
        } catch (err) {
          const reason = createErrorMessage(err, { fields, needsSlug, t });
          setCreated(done);
          setError(done.size > 0
            ? t("collections.createdPartly", {
              created: localeCodes(done.keys()),
              failed: locale.toUpperCase(),
              reason,
            })
            : reason);
          setIsPending(false);
          return;
        }
      }
      const all = [...done.values()];
      reset();
      setIsPending(false);
      onCreated?.(done.get(primary) ?? all[0], all);
    })();
  };

  const discard = () => {
    for (const locale of added) {
      if (!created.has(locale)) standDown(locale, true);
    }
    reset();
  };

  return {
    added,
    add,
    remove,
    valuesFor,
    setField,
    slugFor,
    setSlug,
    statusOf,
    hasDraft: (locale) => pending.get(locale) != null,
    sharedLocked: created.size > 0,
    submit,
    discard,
    hasServerDraft: added.some((l) => pending.get(l) != null),
    isPending,
    error,
  };
}

/**
 * @template V
 * @param {Map<string, V>} map
 * @param {string} key
 * @returns {Map<string, V>}
 */
function withoutKey(map, key) {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}
