"use client";

/**
 * @file Turns a field's `source` into what a `Combobox` eats.
 *
 * A static source is already the answer, so it is mapped once and never asks
 * anything. A collection source has to go over the wire, which is the whole
 * reason the combobox takes `items` plus an optional `onSearch` rather than
 * owning a list: the two kinds of source differ here and nowhere else.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import { useCmsContext } from "../../shared/state/cms-context.js";

const LOOKUP_LIMIT = 20;

/**
 * @import { ChoiceSource } from "../../shared/contracts/schemas.js"
 * @import { ComboboxItem } from "./Combobox.jsx"
 */

/**
 * @param {ChoiceSource | null | undefined} source
 * @param {{ locale?: string | null }} [options]
 * @returns {{ items: ComboboxItem[], search?: (query: string) => void, loading: boolean }}
 *   `search` comes back undefined for a static source, which is what tells the
 *   combobox to match locally instead of asking.
 */
export function useChoiceSource(source, { locale } = {}) {
  const { config, getAccessToken } = useCmsContext();

  const collection = source?.kind === "collection" ? source.collection : null;
  const values = source?.kind === "static" ? source.values : null;

  const [remote, setRemote] = useState(/** @type {ComboboxItem[]} */ ([]));
  const [loading, setLoading] = useState(false);
  // Answers can land out of order, and a slow one for "a" must not overwrite
  // the list for "ahmet". Only the newest request is allowed to paint.
  const seqRef = useRef(0);

  const staticItems = useMemo(
    () => (values ?? []).map((v) => ({ value: v, label: v })),
    [values],
  );

  const search = useCallback(
    /** @param {string} query */
    async (query) => {
      if (!collection || !config.transport?.lookupCollection) return;
      const seq = ++seqRef.current;
      setLoading(true);
      try {
        const token = await getAccessToken();
        const res = await config.transport.lookupCollection(
          collection,
          { q: query, locale: locale ?? undefined, limit: LOOKUP_LIMIT },
          { accessToken: token },
        );
        if (seq !== seqRef.current) return;
        setRemote((res?.items ?? []).map((i) => ({ value: i.slug, label: i.label || i.slug })));
      } catch {
        // A failed lookup shows an empty list, which the combobox already words
        // as "nothing matches". Louder would be wrong for a keystroke.
        if (seq === seqRef.current) setRemote([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [collection, locale, config, getAccessToken],
  );

  if (!collection) return { items: staticItems, loading: false };
  return { items: remote, search, loading };
}
