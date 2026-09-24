/**
 * @file The publish half of creating a collection record: which request a new
 * record goes out as, and what a refusal tells the editor. Shared by the
 * single-language create flow and the multilingual one, which differ in how
 * many records they send, not in how each one is sent.
 */

import { CmsApiError } from "../shared/contracts/errors.js";
import { humanizeCollectionError } from "./record-errors.js";

/**
 * @import { CmsTransport } from "../shared/contracts/transport.js"
 * @import { CollectionFieldDescriptor, CollectionItemResponse } from "../shared/contracts/schemas.js"
 * @import { Translate } from "../shared/i18n/translate.js"
 */

/**
 * Send one new record. With a `slug` it is a `PUT` at that slug carrying
 * `version: null`, which is how a `UserDefined` collection creates; the upsert
 * refuses rather than overwrites when the slug is taken. Without one it is a
 * `POST`, and the backend derives the slug.
 *
 * @param {CmsTransport} transport
 * @param {string} collectionKey
 * @param {{
 *   data: Record<string, *>,
 *   slug?: string,
 *   locale?: string | null,
 *   translationGroup?: string,
 *   accessToken?: string | null,
 * }} request
 * @returns {Promise<CollectionItemResponse>}
 */
export function createRecord(transport, collectionKey, { data, slug, locale, translationGroup, accessToken }) {
  const opts = { accessToken: accessToken ?? undefined, locale: locale ?? undefined, translationGroup };
  return slug
    ? transport.upsertCollectionItem(collectionKey, slug, { data, version: null }, opts)
    : transport.createCollectionItem(collectionKey, { data }, opts);
}

/**
 * The line a refused create shows the editor.
 *
 * @param {*} err
 * @param {{ fields: CollectionFieldDescriptor[], needsSlug: boolean, t: Translate }} context
 * @returns {string}
 */
export function createErrorMessage(err, { fields, needsSlug, t }) {
  if (err instanceof CmsApiError && err.isConflict) {
    // A write race, not a version clash: creates carry no version. Two
    // surfaces POSTing the collection's single new-item slot is the way in
    // (see the `active` contract in use-collection-editor.js).
    return t("collections.createRace");
  }
  if (err instanceof CmsApiError && err.isForbidden) return t("collections.createForbidden");
  if (err instanceof CmsApiError && err.status === 400 && needsSlug && /version/i.test(err.detail ?? "")) {
    // The upsert found a row where this create said there was none, and
    // answers "Version is required when writing to existing item". Read ahead
    // of the humanizer below, which turns every 400 into a data-is-invalid
    // banner, and matched on the text because this one carries no
    // machine-readable reason the way the archived 409 does.
    return t("collections.slugTaken");
  }
  if (err instanceof CmsApiError && err.status === 400) {
    // Backend reports inner failures as `works[0].title`; map onto schema
    // labels for a readable banner.
    return humanizeCollectionError(err.detail, fields, t)
      ?? t("collections.invalidData", { detail: err.message });
  }
  return /** @type {Error} */ (err).message;
}
