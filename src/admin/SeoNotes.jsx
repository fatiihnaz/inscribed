"use client";

/**
 * @file What a page's `seo.*` rows say under their editors, and the question
 * the noindex switch asks before it takes a page out of search.
 */

import { FieldMessage } from "../editors/FieldMessage.jsx";
import { BlockNotice, NoticeButton } from "./BlockNotice.jsx";
import { useCmsStrings } from "../core/hooks/use-cms-strings.js";

/**
 * @import { BlockResponse } from "../shared/contracts/schemas.js"
 */

// The catalog keys are the block paths themselves.
const SEO_PATHS = new Set(["seo.title", "seo.description", "seo.image", "seo.noindex"]);

/** @param {string} blockPath */
export function isSeoBlock(blockPath) {
  return SEO_PATHS.has(blockPath);
}

/** @param {*} value */
function plainLength(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().length : 0;
}

/**
 * @param {{ block: BlockResponse, value: * }} props
 */
export function SeoNote({ block, value }) {
  const t = useCmsStrings();
  // The home page's title stands alone and its image stands in for every page's.
  const home = block._slug === "/";
  switch (block.blockPath) {
    case "seo.title":
      return <FieldMessage>{t(home ? "seo.homeTitleNote" : "seo.titleNote", { count: plainLength(value) })}</FieldMessage>;
    case "seo.description": {
      const count = plainLength(value);
      return <FieldMessage tone={count > 160 ? "warn" : "hint"}>{t("seo.descriptionNote", { count })}</FieldMessage>;
    }
    case "seo.image":
      return home ? <FieldMessage>{t("seo.homeImageNote")}</FieldMessage> : null;
    case "seo.noindex":
      return value === true ? <FieldMessage tone="warn">{t("seo.noindexOn")}</FieldMessage> : null;
    default:
      return null;
  }
}

/**
 * @param {{ show: boolean, onConfirm: () => void, onCancel: () => void }} props
 */
export function NoindexConfirm({ show, onConfirm, onCancel }) {
  const t = useCmsStrings();
  return (
    <BlockNotice
      show={show}
      tone="warn"
      title={t("seo.noindexConfirmTitle")}
      label={t("seo.noindexConfirmLabel")}
      actions={
        <>
          <NoticeButton onClick={onCancel}>{t("seo.noindexCancel")}</NoticeButton>
          <NoticeButton onClick={onConfirm} variant="primary">{t("seo.noindexConfirm")}</NoticeButton>
        </>
      }
    >
      <span>{t("seo.noindexConfirmBody")}</span>
    </BlockNotice>
  );
}
