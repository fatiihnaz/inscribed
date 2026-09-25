"use client";

/**
 * @file A record's copies in its collection's other languages, under the
 * record's card on the page: the records its translation group already has,
 * and for each language it lacks, a form whose record the card creates when it
 * publishes.
 *
 * Only prose is written here, as in the multilingual create form. The rest of
 * a translation is this record's own values, copied at creation, and anything
 * that should differ per language is edited on that record afterwards.
 *
 * Each language that has something for the next publish registers how to
 * validate and send it with the card, which runs them all from one click.
 */

import { useEffect, useRef, useState } from "react";

import { Languages } from "../shared/style/icons.jsx";
import { useCmsContext } from "../shared/state/cms-context.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useCollectionContext } from "../collections/context.js";
import { useCollectionMeta } from "../collections/hooks/use-my-collections.js";
import { useCollectionEditor, useEditorDirty, useEditorValues } from "../collections/hooks/use-collection-editor.js";
import { useDrawerDraftRole } from "../collections/hooks/use-draft-driver.js";
import { CollectionFieldInput } from "../collections/CollectionFieldsForm.jsx";
import { SlugField } from "../collections/SlugField.jsx";
import { buildPayload, requiredMissing } from "../collections/record-payload.js";
import { createRecord, createErrorMessage } from "../collections/create-record.js";
import { TRANSLATABLE_TYPES } from "../shared/util/translatable.js";
import { BlockNotice, NoticeButton } from "./BlockNotice.jsx";
import { useDrawerNav } from "./drawer-nav.js";
import { TEXT_MUTED, TEXT_FAINT, FONT_SANS, COLLECTION_ACCENT, dynamicSize } from "../shared/style/tokens.js";

/**
 * @import { CollectionItemResponse, CollectionFieldDescriptor } from "../shared/contracts/schemas.js"
 */

/**
 * What one language adds to the card's next publish.
 *
 * @typedef {Object} TranslationEntry
 * @property {() => string | null} validate  The refusal, checked before anything is sent.
 * @property {() => Promise<string | null>} publish  Resolves with the refusal, or null once live.
 */

/** Where the slug typed for a record that does not exist yet is kept. */
const SLUG = "__slug";

/**
 * Where a translation typed for a record that does not exist yet waits for the
 * card to publish. In the collection store, next to the forms' working copies,
 * so it outlives the card through a navigation; the backend's new-record draft
 * cannot hold it, having one slot per language for the whole collection.
 *
 * @param {string} collection
 * @param {string} slug  The record it translates.
 * @param {string} locale
 */
export function newTranslationKey(collection, slug, locale) {
  return `translation:${locale}:${collection}:${slug}`;
}

/**
 * Whether anything was typed for a record that does not exist yet.
 *
 * @param {Record<string, *> | null | undefined} typed
 */
export function hasTyped(typed) {
  if (!typed) return false;
  return Object.values(typed).some((v) => typeof v === "string" ? v.trim() !== "" : v != null);
}

/**
 * @param {{
 *   collection: string,
 *   item: CollectionItemResponse,
 *   readSource: () => Record<string, *> | null,
 *   show: boolean,
 *   canClose: boolean,
 *   onClose: () => void,
 *   visible: boolean,
 *   register: (locale: string, entry: TranslationEntry | null) => void,
 * }} props
 *   `readSource` is this record's form as it stands, read when a translation is
 *   created: the values it copies are the ones going out in the same click.
 *   `visible` is whether anyone can see the card, for the sibling editors'
 *   draft role.
 */
export function RecordTranslations({ collection, item, readSource, show, canClose, onClose, visible, register }) {
  const t = useCmsStrings();
  const meta = useCollectionMeta(collection);
  const fields = meta?.schema?.fields ?? [];
  const prose = fields.filter((f) => TRANSLATABLE_TYPES.has(f.type) && !f.readOnly && !f.computed);
  const languages = (meta?.locales ?? []).filter((l) => l !== item.locale);
  const siblings = new Map((item.translations ?? []).map((entry) => [entry.locale, entry.slug]));
  // The same bar as the panel's "+ EN": a claim-derived slug belongs to one
  // user, and without a group there is nothing to link a new record into.
  const canCreate = Boolean(meta?.canCreate)
    && meta?.slugSource !== "ClaimDerived"
    && Boolean(item.translationGroupId);

  return (
    <BlockNotice
      show={show}
      tone="neutral"
      placement="below"
      icon={<Languages size={12} />}
      title={t("translations.label")}
      label={t("translations.label")}
      aside={canClose ? (
        <NoticeButton onClick={onClose} tone="neutral" aria-label={t("translations.dismissLabel")}>
          {t("translations.dismiss")}
        </NoticeButton>
      ) : null}
    >
      <div style={listStyle}>
        {languages.map((locale) => {
          const slug = siblings.get(locale);
          return slug ? (
            <SiblingRow
              key={locale}
              collection={collection}
              slug={slug}
              locale={locale}
              prose={prose}
              visible={visible}
              register={register}
            />
          ) : (
            <NewSiblingRow
              key={locale}
              collection={collection}
              source={item}
              locale={locale}
              prose={prose}
              fields={fields}
              needsSlug={meta?.slugSource === "UserDefined"}
              canCreate={canCreate}
              readSource={readSource}
              register={register}
            />
          );
        })}
      </div>
    </BlockNotice>
  );
}

/**
 * A language the record already has: that record's own editor, showing its
 * prose. What is typed is that record's draft, and goes out with the card's
 * next publish.
 *
 * @param {{
 *   collection: string,
 *   slug: string,
 *   locale: string,
 *   prose: CollectionFieldDescriptor[],
 *   visible: boolean,
 *   register: (locale: string, entry: TranslationEntry | null) => void,
 * }} props
 */
function SiblingRow({ collection, slug, locale, prose, visible, register }) {
  const t = useCmsStrings();
  const nav = useDrawerNav();
  const role = useDrawerDraftRole(collection, slug, visible);
  const editor = useCollectionEditor(collection, slug, role);
  const values = useEditorValues(editor.editorId);
  const isDirty = useEditorDirty(editor);
  const code = locale.toUpperCase();
  // Written from this card, which is what puts it in the card's publish. A
  // draft left on that record from elsewhere shows here but stays out, the way
  // another language's drafts do on a page until someone includes them.
  const [written, setWritten] = useState(false);
  const pending = written && isDirty && editor.canEdit;

  // Read at publish time, so the entry registered once still sends the latest.
  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => {
    if (!pending) return undefined;
    register(locale, {
      validate: () => {
        const current = editorRef.current;
        const now = current.readValues();
        const missing = current.schema && now ? requiredMissing(current.schema.fields, now) : null;
        return missing ? t("collections.requiredMissingIn", { locale: code, field: missing }) : null;
      },
      publish: () => editorRef.current.save(),
    });
    return () => register(locale, null);
  }, [pending, locale, code, register, t]);

  return (
    <div style={rowStyle}>
      <span style={badgeStyle}>{code}</span>
      <div style={stackStyle}>
        {values ? prose.map((field) => (
          <CollectionFieldInput
            key={field.name}
            field={field}
            value={values[field.name]}
            onChange={(next) => {
              setWritten(true);
              editor.setValues({ ...editor.readValues(), [field.name]: next });
            }}
            disabled={!editor.canEdit || editor.isPending}
            variant="drawer"
          />
        )) : <span style={hintStyle}>{t("collections.loading")}</span>}
        {nav ? (
          <button
            type="button"
            onClick={() => nav.openRecord(collection, slug)}
            className="inscribed-text-button"
            style={linkStyle}
          >
            {t("collections.openTranslation", { locale: code })}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A language the record lacks. Its prose waits here until the card publishes,
 * which creates the record from it and this record's other values, in this
 * record's translation group.
 *
 * @param {{
 *   collection: string,
 *   source: CollectionItemResponse,
 *   locale: string,
 *   prose: CollectionFieldDescriptor[],
 *   fields: CollectionFieldDescriptor[],
 *   needsSlug: boolean,
 *   canCreate: boolean,
 *   readSource: () => Record<string, *> | null,
 *   register: (locale: string, entry: TranslationEntry | null) => void,
 * }} props
 */
function NewSiblingRow({ collection, source, locale, prose, fields, needsSlug, canCreate, readSource, register }) {
  const t = useCmsStrings();
  const { config, getAccessToken, onAfterCollectionSave } = useCmsContext();
  const {
    collectionStore, setEditorValues, clearEditorValues,
    updateCollectionItem, patchCollectionItem, invalidateCollectionList,
  } = useCollectionContext();
  const key = newTranslationKey(collection, source.slug, locale);
  const typed = useEditorValues(key);
  const code = locale.toUpperCase();
  const pending = canCreate && prose.length > 0 && hasTyped(typed);

  const typedRef = useRef(typed);
  typedRef.current = typed;
  const readSourceRef = useRef(readSource);
  readSourceRef.current = readSource;

  useEffect(() => {
    if (!pending) return undefined;
    /** Prose as typed, everything else as this record has it. */
    const valuesToCreate = () => {
      const base = readSourceRef.current() ?? {};
      const now = typedRef.current ?? {};
      /** @type {Record<string, *>} */
      const out = {};
      for (const field of fields) {
        out[field.name] = TRANSLATABLE_TYPES.has(field.type) ? now[field.name] ?? "" : base[field.name];
      }
      return out;
    };
    register(locale, {
      validate: () => {
        const missing = requiredMissing(fields, valuesToCreate());
        if (missing) return t("collections.requiredMissingIn", { locale: code, field: missing });
        if (needsSlug && !String(typedRef.current?.[SLUG] ?? "").trim()) {
          return t("collections.slugMissingIn", { locale: code });
        }
        return null;
      },
      publish: async () => {
        try {
          const accessToken = await getAccessToken();
          const created = await createRecord(config.transport, collection, {
            data: buildPayload(fields, valuesToCreate()),
            slug: needsSlug ? String(typedRef.current?.[SLUG]).trim() : undefined,
            locale,
            translationGroup: source.translationGroupId ?? undefined,
            accessToken,
          });
          updateCollectionItem(collection, created.slug, created);
          // This record learns its new sibling in place: a re-read would put the
          // card back into its loading state for a list it can extend itself.
          const current = collectionStore.get().itemCache.get(`${collection}:${source.slug}`)?.item;
          if (current) {
            patchCollectionItem(collection, source.slug, {
              ...current,
              translations: [...(current.translations ?? []), { locale, slug: created.slug }],
            });
          }
          invalidateCollectionList(collection);
          clearEditorValues(key);
          try {
            await onAfterCollectionSave(collection, created.slug);
          } catch (revalidateErr) {
            // eslint-disable-next-line no-console
            console.warn("[inscribed] onAfterCollectionSave failed:", revalidateErr);
          }
          return null;
        } catch (err) {
          return createErrorMessage(err, { fields, needsSlug, t });
        }
      },
    });
    return () => register(locale, null);
  }, [
    pending, locale, code, key, fields, needsSlug, collection, source.slug, source.translationGroupId,
    register, t, config, getAccessToken, onAfterCollectionSave, collectionStore,
    updateCollectionItem, patchCollectionItem, invalidateCollectionList, clearEditorValues,
  ]);

  if (!canCreate || prose.length === 0) {
    return (
      <div style={rowStyle}>
        <span style={badgeStyle}>{code}</span>
        <span style={hintStyle}>{t("collections.translationAbsent", { locale: code })}</span>
      </div>
    );
  }

  const copied = fields
    .filter((f) => !TRANSLATABLE_TYPES.has(f.type) && !f.readOnly && !f.computed)
    .map((f) => f.label || f.name);
  /** @param {string} name @param {*} next */
  const write = (name, next) => setEditorValues(key, (prev) => ({ ...(prev ?? {}), [name]: next }));

  return (
    <div style={rowStyle}>
      <span style={badgeStyle}>{code}</span>
      <div style={stackStyle}>
        <span style={hintStyle}>{t("collections.translationMissing", { locale: code })}</span>
        {prose.map((field) => (
          <CollectionFieldInput
            key={field.name}
            field={field}
            value={typed?.[field.name] ?? ""}
            onChange={(next) => write(field.name, next)}
            disabled={false}
            variant="drawer"
          />
        ))}
        {needsSlug ? (
          <SlugField value={typed?.[SLUG] ?? ""} onChange={(next) => write(SLUG, next)} variant="drawer" />
        ) : null}
        {copied.length > 0 ? (
          <span style={noteStyle}>{t("collections.translationCopied", { fields: copied.join(", ") })}</span>
        ) : null}
      </div>
    </div>
  );
}

const listStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 14,
});

const rowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
});

// Same marker the block translations use, so a language reads the same on a
// block and on a record.
const badgeStyle = /** @type {React.CSSProperties} */ ({
  marginTop: 2,
  color: TEXT_MUTED,
  fontWeight: 600,
  fontSize: dynamicSize(10),
  lineHeight: 1.4,
  fontFamily: FONT_SANS,
  letterSpacing: "0.06em",
  flexShrink: 0,
});

const stackStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 10,
});

const hintStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_MUTED,
  fontFamily: FONT_SANS,
  fontSize: dynamicSize(11.5),
  lineHeight: 1.45,
});

const noteStyle = /** @type {React.CSSProperties} */ ({
  color: TEXT_FAINT,
  fontFamily: FONT_SANS,
  fontSize: dynamicSize(11),
  lineHeight: 1.45,
});

const linkStyle = /** @type {React.CSSProperties} */ ({
  alignSelf: "flex-start",
  padding: 0,
  border: 0,
  background: "transparent",
  color: COLLECTION_ACCENT,
  fontFamily: FONT_SANS,
  fontSize: dynamicSize(11),
  textDecoration: "underline",
  textUnderlineOffset: 3,
  cursor: "pointer",
});
