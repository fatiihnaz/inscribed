"use client";

/**
 * @file The offer to restate a block in the site's other languages, shown under
 * the block that was just rewritten.
 *
 * It appears on its own, off the diff the drawer already computes: rewriting a
 * sentence is the moment an editor knows what the other languages should say,
 * and asking then costs one glance, while a banner at publish time asks after
 * the thought is gone. Small edits stay silent (see `translation-scope.js`) so
 * the offer keeps meaning something.
 *
 * Past `TRANSLATION_INLINE_MAX` languages the editors would dwarf the block
 * they hang off, so it degrades to a line of text the editor can dismiss.
 * Nothing here is machine translation: the field is prefilled with what that
 * language currently says, and the editor writes the rest.
 *
 * Whatever is typed publishes with the block itself, one PUT per language.
 *
 * The panel itself is `BlockNotice`, shared with the conflict notice.
 */

import { useEffect, useMemo, useState } from "react";

import { Languages, Undo2 } from "../shared/style/icons.jsx";
import { useCmsContext } from "../shared/state/cms-context.js";
import { otherLocales as resolveOtherLocales } from "../shared/route.js";
import { useCmsRoute } from "../core/hooks/use-cms-route.js";
import { useCmsTranslations } from "../core/hooks/use-cms-translations.js";
import { FieldEditor } from "../editors/fields/FieldEditor.jsx";
import { BlockNotice, NoticeButton } from "./BlockNotice.jsx";
import { isSubstantialChange, TRANSLATION_INLINE_MAX } from "./translation-scope.js";
import { blockResetStyle } from "./drawer-styles.js";
import { TEXT, TEXT_MUTED, TEXT_FAINT, FONT_MONO } from "../shared/style/tokens.js";

/**
 * @import { BlockResponse } from "../shared/contracts/schemas.js"
 */

/**
 * Long enough that the prompt never opens mid-word, short enough that it is
 * already there when the editor looks up from the sentence.
 */
const SETTLE_MS = 600;

/**
 * @param {{ block: BlockResponse, value: *, readOnly?: boolean }} props
 */
export function TranslationPrompt({ block, value, readOnly }) {
  const { config, clearTranslationDrafts } = useCmsContext();
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
    enabled: substantial && !tooMany && !readOnly,
  });

  // Once something is typed the prompt stays, whatever the diff says next:
  // trimming the edit back under the threshold must not take a written
  // translation down with it.
  const stagedKeys = targets.filter((t) => t.hasDraft).map((t) => t.key);
  const engaged = stagedKeys.length > 0;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!substantial) setDismissed(false);
  }, [substantial]);

  if (readOnly || others.length === 0) return null;

  return (
    <BlockNotice
      // `isReady` gates the opening, not the contents: a panel that grows while
      // its rows are still empty has to grow a second time when they fill, and
      // that second step is the twitch. It is trivially true in the `tooMany`
      // case, which fetches nothing, and for anything already typed, whose
      // answer is by definition already in.
      show={engaged || (substantial && !dismissed && isReady)}
      tone="neutral"
      // Below the editor, unlike the conflict panel: that one is a decision
      // standing between the editor and their text, this one is the next thing
      // to do once the text is written.
      placement="below"
      icon={<Languages size={12} />}
      title="Bu metin diğer dillerde değişmedi"
      label="Diğer dillerdeki karşılıkları"
      aside={
        // One slot, holding whichever way out applies. With nothing typed the
        // panel is a reminder and closing it costs nothing; once something is
        // typed, closing would strand it, so the exit becomes discarding it.
        // Leaving the slot empty in the second case is what put the undo out
        // beside the field, unaligned with the only other control here.
        engaged ? (
          <NoticeButton
            onClick={() => clearTranslationDrafts(stagedKeys)}
            tone="neutral"
            aria-label="Yazılan çevirileri geri al"
          >
            Geri al
          </NoticeButton>
        ) : (
          <NoticeButton
            onClick={() => setDismissed(true)}
            tone="neutral"
            aria-label="Bu hatırlatmayı kapat"
          >
            Kapat
          </NoticeButton>
        )
      }
    >
      {tooMany ? (
        <p style={noteStyle}>
          {others.length} dil daha var. Her birini kendi sayfasında düzenlemek,
          hepsini buraya sığdırmaktan kolay:{" "}
          <span style={localeListStyle}>{others.join(", ")}</span>.
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
        <span style={rowHintStyle}>Bu dilde bu blok yok</span>
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
      {showReset && target.hasDraft ? (
        <button
          type="button"
          onClick={target.reset}
          className="inscribed-icon-button"
          style={{ ...blockResetStyle, marginTop: BADGE_OFFSET }}
          aria-label={`${target.locale} çevirisini geri al`}
          title="Geri al"
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

const localeListStyle = /** @type {React.CSSProperties} */ ({
  fontFamily: FONT_MONO,
  color: TEXT,
});

const listStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 8,
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
  font: `600 10px/1.4 ${FONT_MONO}`,
  letterSpacing: "0.06em",
  flexShrink: 0,
});

const rowHintStyle = /** @type {React.CSSProperties} */ ({
  marginTop: BADGE_OFFSET,
  color: TEXT_FAINT,
  fontStyle: "italic",
});
