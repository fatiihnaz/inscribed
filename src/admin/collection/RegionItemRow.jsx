"use client";

/**
 * @file `RegionItemRow`: one collection record as a row in the panel's list.
 */

// Aliased: the icon is exported as `Image`, which shadows the global.
import { ChevronRight, Image as ImageGlyph } from "../../shared/style/icons.jsx";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { shortAge } from "./collection-format.js";
import {
  rowStyle, rowBodyStyle, rowTitleStyle, rowSlugHeadlineStyle, rowMetaStyle,
  rowSlugStyle, rowSepStyle, rowAgeStyle, rowSideStyle, rowChevronStyle,
  thumbStyle, thumbImgStyle, thumbEmptyStyle, rowMarkStyle,
  draftChipStyle, readonlyChipStyle, archivedChipStyle,
} from "./collection-styles.js";

/**
 * One collection item as a list row.
 *
 * Two lines, because a record is content and a list of content that shows none
 * of it is a table of primary keys. Line one is what the record *is* (its
 * image, its title, its state); line two is what addresses it (slug, age).
 * That inverts the old row, which led with the identifier and squeezed the
 * value into a 45% tail.
 *
 * @param {{
 *   slug: string, title: string | null, canEdit: boolean, archived?: boolean,
 *   dirty: boolean, isActive?: boolean, updatedAt?: string,
 *   image?: string | null, showThumb?: boolean, onOpen: () => void,
 * }} props
 *   `isActive` is the page's own selection: this row addresses the record the
 *   editor last clicked on the page. It is passed in rather than read here so a
 *   long list doesn't mount one store subscription per row, the same reason
 *   `dirty` arrives as a boolean.
 *
 *   `showThumb` is the schema's answer, not this record's: the column is either
 *   there for every row or for none, so a collection that declares an `Image`
 *   keeps its rows aligned whether or not each one filled it in.
 */
export function RegionItemRow({
  slug, title, canEdit, archived, dirty, isActive, updatedAt, image, showThumb, onOpen,
}) {
  const t = useCmsStrings();
  // No title resolves when the schema has no textual field: the slug then takes
  // the lead and keeps its identifier styling instead of being dressed up as
  // prose, which also leaves the second line to the age alone rather than
  // printing the same string twice.
  const headline = title ?? slug;
  const age = shortAge(updatedAt, t);
  // The row prints "3 g"; hovering it says which day that was.
  const stamp = age && updatedAt ? new Date(updatedAt).toLocaleString() : "";
  // An archived record is still readable, just plainly not the live one.
  const dim = archived ? { opacity: 0.55 } : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`inscribed-listrow${isActive ? " is-active" : ""}`}
      style={showThumb ? rowStyle : { ...rowStyle, gridTemplateColumns: "10px 1fr auto" }}
      aria-current={isActive ? "true" : undefined}
    >
      {showThumb ? (
        image ? (
          <span style={{ ...thumbStyle, ...dim }}>
            {/* Plain <img>: the SDK ships no image loader, and the src is
                whatever host the editor pasted. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" loading="lazy" style={thumbImgStyle} />
          </span>
        ) : (
          // The field exists and this record left it empty. Holding the column
          // is the point: without it the rows below would step left.
          <span style={{ ...thumbEmptyStyle, ...dim }} aria-hidden="true">
            <ImageGlyph size={14} />
          </span>
        )
      ) : (
        // No image column at all: a marker instead, so the text still starts on
        // the list's own left edge rather than against the row's.
        <span className="inscribed-row-mark" style={rowMarkStyle} aria-hidden="true" />
      )}

      <span style={rowBodyStyle}>
        <span
          style={title ? { ...rowTitleStyle, ...dim } : { ...rowSlugHeadlineStyle, ...dim }}
          title={headline}
        >
          {headline}
        </span>

        <span style={rowMetaStyle}>
          {title ? (
            <span className="inscribed-row-slug" style={rowSlugStyle} title={slug}>{slug}</span>
          ) : null}
          {title && age ? <span style={rowSepStyle} aria-hidden="true">·</span> : null}
          {age ? (
            <span
              className="inscribed-row-age"
              style={rowAgeStyle}
              title={t("collections.editedAt", { when: stamp })}
            >
              {age}
            </span>
          ) : null}
        </span>
      </span>

      <span style={rowSideStyle}>
        {/* A tag rather than the drawer's dirty dot. The dot is right where it
            marks one field inside a card the user is already looking at; down a
            list of records it has to say which of three states this row is in,
            and three dots would be a legend. */}
        {dirty ? <span style={draftChipStyle}>{t("collections.draftBadge")}</span> : null}
        {!canEdit ? <span style={readonlyChipStyle}>{t("block.readOnly")}</span> : null}
        {archived ? <span style={archivedChipStyle}>{t("collections.archivedBadge")}</span> : null}
        <span className="inscribed-list-chevron" style={rowChevronStyle} aria-hidden="true">
          <ChevronRight size={13} />
        </span>
      </span>
    </button>
  );
}
