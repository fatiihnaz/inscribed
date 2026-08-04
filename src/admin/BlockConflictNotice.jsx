"use client";

/**
 * @file Per-block conflict resolution, shown on a card the backend refused.
 *
 * A 409 is followed by a refetch, which leaves the two candidate values sitting
 * side by side in the store already: `block.value` is what the other editor
 * published, the local draft is what this user typed. Neither is fetched here,
 * and neither is stored: this only renders the difference and names the two
 * ways out.
 *
 * The resolutions are the card's existing verbs under clearer labels, since in
 * a conflict "Geri al" does not read as "take theirs":
 *   - take theirs  -> pin the published value as the draft, leaving the block clean
 *   - keep mine    -> leave the draft alone; the next save writes it at the
 *                     version the refetch just brought in
 */

import { AnimatePresence, motion } from "framer-motion";

import { DiffContent } from "./ChangesPanel.jsx";
import {
  HAIRLINE, PANEL_TRANSITION, STATUS_WARN, SURFACE_1, TEXT, TEXT_MUTED,
  FONT_SANS, FS_XS, R_MD, R_SM,
} from "../shared/style/tokens.js";

/**
 * @import { BlockResponse } from "../shared/contracts/schemas.js"
 */

/**
 * Owns its own presence rather than being mounted conditionally by the card, so
 * both the arrival (a save came back refused) and the departure (the user
 * picked a side) animate. `initial={false}` keeps a card that mounts already in
 * conflict, which is what reopening the drawer does, from replaying it.
 *
 * The panel itself only fades. Every bit of movement belongs to the `layout` on
 * the card body around it, which is what keeps the two from fighting: a
 * transform here would ride on top of the projection's own and read as a slide.
 * Animating `height: auto` instead meant measuring an auto height, which
 * squashed the text going in and routinely skipped coming out.
 *
 * @param {{
 *   show: boolean,
 *   block: BlockResponse,
 *   draft: *,
 *   onTakeTheirs: () => void,
 *   onKeepMine: () => void,
 * }} props
 */
export function BlockConflictNotice({ show, block, draft, onTakeTheirs, onKeepMine }) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="conflict"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={CONFLICT_TRANSITION}
          style={wrapStyle}
          role="group"
          aria-label="Kaydetme çakışması"
        >
          <div style={headingStyle}>
            Bu blok sen düzenlerken başkası tarafından yayınlandı
          </div>

          {/* Same orientation as the changes panel: left is what is stored,
              right is what would replace it. */}
          <div style={diffStyle}>
            <DiffContent blockType={block.blockType} prev={block.value} next={draft} />
          </div>

          <div style={actionsStyle}>
            <button type="button" onClick={onTakeTheirs} style={secondaryButtonStyle}>
              Onlarınkini al
            </button>
            <button type="button" onClick={onKeepMine} style={primaryButtonStyle}>
              Benimkini koru
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// Fades out quicker than it fades in, so the space starts closing while the
// panel is already on its way out rather than after it.
export const CONFLICT_TRANSITION = {
  duration: 0.2,
  ease: PANEL_TRANSITION.ease,
  opacity: { duration: 0.14, ease: "linear" },
};

const wrapStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  flexDirection: "column",
  gap: 8,
  margin: "2px 0 8px",
  padding: 10,
  borderRadius: R_MD,
  border: `1px solid color-mix(in srgb, ${STATUS_WARN} 35%, transparent)`,
  background: `color-mix(in srgb, ${STATUS_WARN} 7%, transparent)`,
  font: `${FS_XS}px/1.5 ${FONT_SANS}`,
  color: TEXT,
});

const headingStyle = /** @type {React.CSSProperties} */ ({
  color: STATUS_WARN,
  fontWeight: 600,
});

// The diff renderers bring their own type-specific chrome, so this only has to
// give them a surface and keep a long one from stretching the card.
const diffStyle = /** @type {React.CSSProperties} */ ({
  maxHeight: 220,
  overflowY: "auto",
  borderRadius: R_SM,
  border: `1px solid ${HAIRLINE}`,
  background: SURFACE_1,
});

const actionsStyle = /** @type {React.CSSProperties} */ ({
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
});

const buttonBaseStyle = /** @type {React.CSSProperties} */ ({
  padding: "5px 10px",
  borderRadius: R_SM,
  font: `${FS_XS}px/1 ${FONT_SANS}`,
  fontWeight: 600,
  cursor: "pointer",
});

const secondaryButtonStyle = /** @type {React.CSSProperties} */ ({
  ...buttonBaseStyle,
  border: `1px solid ${HAIRLINE}`,
  background: "transparent",
  color: TEXT_MUTED,
});

const primaryButtonStyle = /** @type {React.CSSProperties} */ ({
  ...buttonBaseStyle,
  border: `1px solid color-mix(in srgb, ${STATUS_WARN} 45%, transparent)`,
  background: `color-mix(in srgb, ${STATUS_WARN} 15%, transparent)`,
  color: STATUS_WARN,
});
