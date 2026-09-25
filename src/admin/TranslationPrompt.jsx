"use client";

/**
 * @file A block's copies in the site's other languages, under the block.
 *
 * It opens two ways. On its own, off the diff the drawer already computes:
 * rewriting a sentence is the moment an editor knows what the other languages
 * should say, and asking then costs one glance, while a banner at publish time
 * asks after the thought is gone. Small edits stay silent (see
 * `translation-scope.js`) so the offer keeps meaning something. And on request,
 * from the row's languages button, for any field the panel has an editor for.
 *
 * Past `TRANSLATION_INLINE_MAX` languages the editors would dwarf the block
 * they hang off, so it degrades to a line of text the editor can dismiss.
 * Nothing here is machine translation: the field is prefilled with what that
 * language says now, its draft included, and the editor writes the rest.
 *
 * Whatever is typed is saved as that language's draft and puts the language
 * into the next publish (see `useCmsTranslations`).
 *
 * The panel itself is `BlockNotice`, shared with the conflict notice.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { Languages, Undo2 } from "../shared/style/icons.jsx";
import { useCmsContext } from "../shared/state/cms-context.js";
import { otherLocales as resolveOtherLocales } from "../shared/route.js";
import { localeCodes } from "../shared/util/locale-codes.js";
import { useCmsRoute } from "../core/hooks/use-cms-route.js";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";
import { useCmsTranslations } from "../core/hooks/use-cms-translations.js";
import { FieldEditor } from "../editors/FieldEditor.jsx";
import { BlockNotice, NoticeButton } from "./BlockNotice.jsx";
import { isSubstantialChange, TRANSLATION_INLINE_MAX } from "./translation-scope.js";
import { blockResetStyle } from "./drawer-styles.js";
import { TEXT_MUTED, TEXT_FAINT, FONT_SANS, dynamicSize } from "../shared/style/tokens.js";

/**
 * @import { BlockResponse } from "../shared/contracts/schemas.js"
 */

/**
 * Long enough that the prompt never opens mid-word, short enough that it is
 * already there when the editor looks up from the sentence.
 */
const SETTLE_MS = 600;

/**
 * @param {{
 *   block: BlockResponse,
 *   value: *,
 *   readOnly?: boolean,
 *   open?: boolean,
 *   onClose?: () => void,
 *   undoRef?: { current: (() => void) | null },
 *   onEditedChange?: (edited: boolean) => void,
 * }} props
 *   `open` is the row's languages button: the panel shows whatever the diff says.
 *   `undoRef` and `onEditedChange` let the row's own undo cover what was
 *   written here: the panel fills the one, and reports through the other
 *   whether there is anything for it to undo.
 */
export function TranslationPrompt({ block, value, readOnly, open = false, onClose, undoRef, onEditedChange }) {
  const t = useCmsStrings();
  const { config } = useCmsContext();
  const { locale } = useCmsRoute();
  const others = resolveOtherLocales(config, locale);
  const tooMany = others.length > TRANSLATION_INLINE_MAX;

  // The diff runs on a settled value, not on every keystroke: it is an LCS over
  // the whole block, and the answer is only interesting once typing stops.
  //
  // `block.value` resets it, which is not an optimisation. Switching language
  // swaps the published text under a card that keeps its identity (same
  // blockPath, same component instance), so for one debounce the hook was still
  // holding the Turkish draft while the block had become the English one. That
  // reads as a rewrite of the whole block, and the panel flashed open on every
  // switch before closing itself again.
  const settled = useSettled(value, SETTLE_MS, block.value);
  const substantial = useMemo(
    () => isSubstantialChange(block.blockType, block.value, settled),
    [block.blockType, block.value, settled],
  );

  const { targets, isReady } = useCmsTranslations(block, {
    enabled: (substantial || open) && !tooMany && !readOnly,
  });

  const edited = targets.filter((x) => x.edited);
  const engaged = edited.length > 0;
  const saving = targets.some((x) => x.saving);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!substantial) setDismissed(false);
  }, [substantial]);

  const editedRef = useRef(edited);
  editedRef.current = edited;
  useEffect(() => {
    if (!undoRef) return undefined;
    undoRef.current = () => {
      for (const target of editedRef.current) target.reset();
    };
    return () => { undoRef.current = null; };
  }, [undoRef]);
  // Only a change is reported: the row starts out assuming nothing was
  // written, and a report of that on mount costs every row a render.
  const reportedRef = useRef(false);
  useEffect(() => {
    if (reportedRef.current === engaged) return;
    reportedRef.current = engaged;
    onEditedChange?.(engaged);
  }, [engaged, onEditedChange]);

  if (readOnly || others.length === 0) return null;

  const offered = open || (substantial && !dismissed);
  const close = () => {
    setDismissed(true);
    onClose?.();
  };

  return (
    <BlockNotice
      // `isReady` gates the opening, not the contents: a panel that grows while
      // its rows are still empty has to grow a second time when they fill, and
      // that second step is the twitch. It is trivially true in the `tooMany`
      // case, which fetches nothing. Once something is typed the panel stays
      // until it is closed: trimming the edit back under the threshold must
      // not take the translation off screen mid-thought.
      show={(offered && isReady) || (engaged && (open || !dismissed))}
      tone="neutral"
      // Below the editor, unlike the conflict panel: that one is a decision
      // standing between the editor and their text, this one is the next thing
      // to do once the text is written.
      placement="below"
      icon={<Languages size={12} />}
      title={substantial && !open ? t("translations.title") : t("translations.label")}
      label={t("translations.label")}
      aside={(
        <>
          {engaged ? (
            <NoticeButton
              onClick={() => { for (const target of edited) target.reset(); }}
              tone="neutral"
              aria-label={t("translations.undoAllLabel")}
            >
              {t("translations.undoAll")}
            </NoticeButton>
          ) : null}
          <NoticeButton onClick={close} tone="neutral" aria-label={t("translations.dismissLabel")}>
            {t("translations.dismiss")}
          </NoticeButton>
        </>
      )}
    >
      {tooMany ? (
        <p style={noteStyle}>
          {t("translations.tooMany", { count: others.length, list: others.join(", ") })}
        </p>
      ) : (
        <div style={listStyle}>
          {targets.map((target) => (
            <TranslationRow
              key={target.locale}
              target={target}
              blockType={block.blockType}
              // With one language the header's "Geri al" already undoes the
              // only thing there is to undo, and a second button beside the
              // field would be the same verb twice.
              showReset={targets.length > 1}
            />
          ))}
          {engaged ? (
            <p role="status" style={statusStyle}>
              {saving
                ? t("translations.saving")
                : t("translations.saved", { locales: localeCodes(edited.map((x) => x.locale)) })}
            </p>
          ) : null}
        </div>
      )}
    </BlockNotice>
  );
}

/**
 * @param {{
 *   target: import("../core/hooks/use-cms-translations.js").TranslationTarget,
 *   blockType: string,
 *   showReset: boolean,
 * }} props
 */
function TranslationRow({ target, blockType, showReset }) {
  const t = useCmsStrings();
  const badge = (
    <span style={localeBadgeStyle} title={target.pathname}>
      {target.locale.toUpperCase()}
    </span>
  );

  // The panel only opens once every language has been answered for, so a
  // missing block here means that language genuinely has no row for this path,
  // not that one is still on the way. No editor: there is no version to write
  // it back at.
  if (!target.block) {
    return (
      <div style={rowStyle}>
        {badge}
        <span style={rowHintStyle}>{t("translations.missing")}</span>
      </div>
    );
  }

  return (
    <div style={rowStyle}>
      {badge}
      <div style={rowFieldStyle}>
        <FieldEditor
          blockType={blockType}
          value={target.value}
          onChange={target.setValue}
          hideLabel
        />
      </div>
      {showReset && target.edited ? (
        <button
          type="button"
          onClick={target.reset}
          className="inscribed-icon-button"
          style={{ ...blockResetStyle, marginTop: BADGE_OFFSET }}
          aria-label={t("translations.undoOne", { locale: target.locale })}
          title={t("block.undo")}
        >
          <Undo2 size={12} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * `value`, but only after it has held still for `ms`. Returns the live value on
 * the first render so the prompt can settle out of an edit already in progress
 * (reopening the drawer over a pending draft) instead of waiting for a keypress
 * that never comes.
 *
 * `resetKey` snaps it back to the live value immediately, for when the thing
 * being compared against has been replaced rather than edited.
 *
 * @template T
 * @param {T} value
 * @param {number} ms
 * @param {*} resetKey
 * @returns {T}
 */
function useSettled(value, ms, resetKey) {
  const [settled, setSettled] = useState(value);
  const [lastKey, setLastKey] = useState(resetKey);
  // Adjusting state during render, which is the sanctioned way to react to a
  // changed input without a wasted commit. A `useEffect` here would let one
  // frame through holding the old value, and one frame is all the flash was.
  if (!Object.is(lastKey, resetKey)) {
    setLastKey(resetKey);
    setSettled(value);
  }
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, settled, ms]);
  return settled;
}

const noteStyle = /** @type {React.CSSProperties} */ ({
  margin: 0,
  color: TEXT_MUTED,
});

const listStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 8,
});

const statusStyle = /** @type {React.CSSProperties} */ ({
  margin: 0,
  color: TEXT_FAINT,
  fontFamily: FONT_SANS,
  fontSize: dynamicSize(11),
});

/**
 * Drop from the row's top to the first text line of the field beside it: the
 * field's border plus its padding, less half the difference in line height. It
 * keeps the label reading as a prefix to the sentence rather than a caption
 * floating above it.
 */
const BADGE_OFFSET = 8;

// The label sits beside the field, not on a header line of its own. That header
// was a whole row per language, and the label is two letters.
const rowStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
});

// A flex column, not a plain block, and that is load-bearing: `<textarea>` and
// `<input>` size themselves from `cols`/`size`, so inside a block parent they
// sit at their intrinsic ~20-character width and the text wraps into a tall
// column beside acres of empty row. Stretching them is what the editor slot in
// `BlockCard` does, for the same reason.
const rowFieldStyle = /** @type {React.CSSProperties} */ ({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
});

const localeBadgeStyle = /** @type {React.CSSProperties} */ ({
  marginTop: BADGE_OFFSET,
  color: TEXT_MUTED,
  fontWeight: 600,
  fontSize: dynamicSize(10),
  lineHeight: 1.4,
  fontFamily: FONT_SANS,
  letterSpacing: "0.06em",
  flexShrink: 0,
});

const rowHintStyle = /** @type {React.CSSProperties} */ ({
  marginTop: BADGE_OFFSET,
  color: TEXT_FAINT,
  fontStyle: "italic",
});
