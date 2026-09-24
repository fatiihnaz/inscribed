/**
 * @file Which field and block types hold prose, the kind an editor writes again
 * in each language. The drawer's translation offer and the multilingual create
 * form both go by this, so a type is translated in both places or in neither.
 */

export const TRANSLATABLE_TYPES = new Set(["ShortText", "LongText", "RichText"]);
