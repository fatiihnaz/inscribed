"use client";

/**
 * @file `RecordHeader`: the block a record's detail pane opens with.
 *
 * The pane used to headline with the record's *address*, which is the one thing
 * about it nobody chose. This gathers what the record actually is: its image,
 * its title as the editor is typing it, and underneath, the address, the state
 * and the languages it exists in.
 *
 * The title and the image are read one key at a time (`useEditorField`) rather
 * than through the whole values object, so typing in some other field of the
 * form does not re-render this.
 */

import { useEditorField } from "../../collections/hooks/use-collection-editor.js";
import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
// Aliased: the icon is exported as `Image`, which shadows the global.
import { Image as ImageGlyph } from "../../shared/style/icons.jsx";
import { shortAge } from "./collection-format.js";
import { TranslationChips } from "./TranslationChips.jsx";
import {
  recordCardStyle, recordBodyStyle, recordTitleStyle, recordTitleEmptyStyle,
  recordSubStyle, recordStateStyle, recordDotStyle, recordSepStyle, recordChipRowStyle,
  thumbImgStyle, recordThumbStyle, recordThumbEmptyStyle,
} from "./collection-styles.js";

/**
 * @param {{
 *   editor: import("../../collections/hooks/use-collection-editor.js").CollectionEditorState,
 *   titleField: string | null,
 *   imageField: string | null,
 *   dirty: boolean,
 *   locales: string[] | undefined,
 *   slugHeading: React.ReactNode,
 *   onOpenItem: (slug: string) => void,
 *   onAddTranslation: (locale: string, translationGroupId: string) => void,
 * }} props
 *   `slugHeading` arrives as a node because the address is also the rename
 *   control, and the state that opens it belongs to the pane rather than here.
 */
export function RecordHeader({
  editor, titleField, imageField, dirty, locales, slugHeading, onOpenItem, onAddTranslation,
}) {
  const t = useCmsStrings();
  const rawTitle = useEditorField(editor.editorId, titleField ?? "");
  const rawImage = useEditorField(editor.editorId, imageField ?? "");

  const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : null;
  const src = rawImage && typeof rawImage === "object"
    ? /** @type {{ src?: unknown }} */ (rawImage).src
    : undefined;
  const image = typeof src === "string" && src.trim() ? src : null;

  const stamp = editor.item?.updatedAt ?? editor.item?.createdAt;
  const age = shortAge(stamp, t);

  return (
    <div style={recordCardStyle}>
      {imageField ? (
        image ? (
          <span style={recordThumbStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" style={thumbImgStyle} />
          </span>
        ) : (
          <span style={recordThumbEmptyStyle} aria-hidden="true">
            <ImageGlyph size={17} />
          </span>
        )
      ) : null}

      <div style={recordBodyStyle}>
        {/* A record with nothing typed in its title field yet still needs a
            heading, and the slug is already the line below. */}
        <span style={title ? recordTitleStyle : recordTitleEmptyStyle} title={title ?? undefined}>
          {title ?? t("collections.untitledRecord")}
        </span>

        <span style={recordSubStyle}>
          {slugHeading}
          {dirty ? (
            <>
              <span style={recordSepStyle} aria-hidden="true">·</span>
              <span style={recordStateStyle}>
                <span style={recordDotStyle} aria-hidden="true" />
                {t("collections.draftBadge")}
              </span>
            </>
          ) : null}
          {age ? (
            <>
              <span style={recordSepStyle} aria-hidden="true">·</span>
              <span title={stamp ? t("collections.editedAt", { when: new Date(stamp).toLocaleString() }) : undefined}>
                {age}
              </span>
            </>
          ) : null}
        </span>

        <span style={recordChipRowStyle}>
          <TranslationChips
            item={editor.item}
            locales={locales}
            canEdit={editor.canEdit}
            onOpenItem={onOpenItem}
            onAddTranslation={onAddTranslation}
          />
        </span>
      </div>
    </div>
  );
}
