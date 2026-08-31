"use client";

/**
 * @file The strip under the panel's search box: what the rows are sorted by,
 * which direction, which language the panel is working in, and whether it is
 * showing the archive.
 */

import { AnimatePresence, motion } from "framer-motion";
import { Archive, ArrowDown, ArrowUp } from "../../shared/style/icons.jsx";

import { useCmsStrings } from "../../core/hooks/use-cms-strings.js";
import { splitSort } from "./collection-format.js";
import { Menu } from "../Menu.jsx";
import { PANEL_TRANSITION } from "../../shared/style/tokens.js";
import {
  toolbarStyle, directionIconStyle, toolChipStyle, sortChipStyle, directionChipStyle,
  localeSwitchStyle, localeSegStyle, localeSegOnStyle, localeMenuTriggerStyle,
} from "./collection-styles.js";

/**
 * Sort picker, language switch and archive toggle, in one strip under the
 * search box.
 *
 * The direction is a separate button rather than two entries per column: the
 * options come from the schema, so folding direction in would double a list
 * that already grows with the collection.
 *
 * @param {{
 *   sort: string,
 *   onSortChange: (next: string) => void,
 *   options: { value: string, labelKey?: string, label?: string }[],
 *   showArchived: boolean,
 *   onToggleArchived: () => void,
 *   locales: string[] | undefined,
 *   locale: string | null,
 *   onLocaleChange: (next: string) => void,
 * }} props
 */
export function ListToolbar({
  sort, onSortChange, options, showArchived, onToggleArchived, locales, locale, onLocaleChange,
}) {
  const t = useCmsStrings();
  const [column, direction] = splitSort(sort);
  // One language is not a choice, and none at all means the collection isn't
  // localized: either way there is nothing to switch between.
  const showLocales = (locales?.length ?? 0) > 1;
  const ascending = direction === "asc";
  const directionLabel = ascending ? t("collections.sortAsc") : t("collections.sortDesc");

  const sortOptions = options.map((opt) => ({
    value: opt.value,
    label: opt.labelKey ? t(opt.labelKey) : (opt.label ?? opt.value),
  }));

  return (
    <div style={toolbarStyle}>
      {/* Sort and its direction read as one control and are two: a chip whose
          label names the column, joined to a chip that flips the arrow. Nesting
          the arrow inside the menu button would be a button inside a button. */}
      <Menu
        value={column}
        options={sortOptions}
        onChange={(next) => onSortChange(`${next}:${direction}`)}
        label={t("collections.sortBy")}
        triggerClass="inscribed-toolchip"
        triggerStyle={sortChipStyle}
      />

      <button
        type="button"
        onClick={() => onSortChange(`${column}:${ascending ? "desc" : "asc"}`)}
        className="inscribed-toolchip"
        style={directionChipStyle}
        aria-label={directionLabel}
        title={directionLabel}
      >
        {/* Swapped, not rotated: a 180° flip passes through horizontal, where an
            arrow points at nothing and reads as a spinner. `mode="wait"` lets
            the old one collapse before the new one grows, so the two arrowheads
            never occupy the button at once. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={direction}
            style={directionIconStyle}
            initial={{ scale: 0.35, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.35, opacity: 0 }}
            transition={{ duration: 0.13, ease: PANEL_TRANSITION.ease }}
          >
            {ascending ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          </motion.span>
        </AnimatePresence>
      </button>

      <span style={{ flex: 1 }} />

      {showLocales ? <LocaleSwitch locales={locales} locale={locale} onChange={onLocaleChange} /> : null}

      {/* Named, not an icon alone. The archive is a place the list can be in,
          and a lone drawer glyph asked the user to remember which of the
          toolbar's squares meant that. */}
      <button
        type="button"
        onClick={onToggleArchived}
        className={`inscribed-toolchip${showArchived ? " is-on" : ""}`}
        style={toolChipStyle}
        aria-pressed={showArchived}
        title={t("collections.showArchive")}
      >
        <Archive size={12} />
        {t("collections.archiveChip")}
      </button>
    </div>
  );
}

// Past this many languages the flat switch is wider than the space the toolbar
// has left, so it folds into a menu. Three fits beside the sort picker at the
// drawer's width; four does not.
const SEGMENTED_LOCALE_LIMIT = 3;

/**
 * Flat while the languages fit, a menu once they don't. Two codes are one tap
 * apart and that is worth keeping; eight would either wrap the toolbar onto a
 * second line or scroll sideways, and both are worse than one extra tap.
 *
 * @param {{ locales: string[], locale: string | null, onChange: (next: string) => void }} props
 */
function LocaleSwitch({ locales, locale, onChange }) {
  const t = useCmsStrings();

  if (locales.length > SEGMENTED_LOCALE_LIMIT) {
    return (
      <Menu
        value={locale ?? locales[0]}
        options={locales.map((code) => ({ value: code, label: code.toUpperCase() }))}
        onChange={onChange}
        label={t("collections.viewLocale")}
        triggerClass="inscribed-toolchip"
        triggerStyle={localeMenuTriggerStyle}
      />
    );
  }

  return (
    <div style={localeSwitchStyle} role="group" aria-label={t("collections.viewLocale")}>
      {locales.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            aria-pressed={active}
            className="inscribed-seg"
            title={t("collections.viewLocaleIs", { locale: code.toUpperCase() })}
            style={active ? localeSegOnStyle : localeSegStyle}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
