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
 *
 * The panel itself is `BlockNotice`, shared with the translation prompt.
 */

import { GitMerge } from "../shared/style/icons.jsx";

import { DiffContent } from "./ChangesPanel.jsx";
import { BlockNotice, NoticeButton, noticeFrameStyle } from "./BlockNotice.jsx";

/**
 * @import { BlockResponse } from "../shared/contracts/schemas.js"
 */

/**
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
    <BlockNotice
      show={show}
      tone="warn"
      placement="above"
      icon={<GitMerge size={12} />}
      title="Bu blok sen düzenlerken başkası tarafından yayınlandı"
      label="Kaydetme çakışması"
      actions={
        <>
          <NoticeButton onClick={onTakeTheirs} tone="warn">
            Onlarınkini al
          </NoticeButton>
          <NoticeButton onClick={onKeepMine} tone="warn" variant="primary">
            Benimkini koru
          </NoticeButton>
        </>
      }
    >
      {/* Same orientation as the changes panel: left is what is stored,
          right is what would replace it. */}
      <div style={noticeFrameStyle}>
        <DiffContent blockType={block.blockType} prev={block.value} next={draft} />
      </div>
    </BlockNotice>
  );
}
