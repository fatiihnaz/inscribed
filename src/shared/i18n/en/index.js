/**
 * @file The English catalog, assembled from its areas.
 * Keys are flat and globally unique, so the areas are a filing decision rather
 * than a namespace.
 */

import { panel } from "./panel.js";
import { collections } from "./collections.js";
import { editors } from "./editors.js";
import { core } from "./core.js";

export const en = Object.freeze({ ...panel, ...collections, ...editors, ...core });
