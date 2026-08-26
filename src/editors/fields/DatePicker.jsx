"use client";

/**
 * @file Calendar picker with an optional time strip, replacing the native
 * `datetime-local` box.
 *
 * The native control was the last place the drawer's look depended on which
 * browser the editor happened to use, and it needed a `color-scheme: dark` hack
 * to stop rendering a white panel on a dark field.
 *
 * Month and weekday names come from `Intl`, not the string catalog: they are
 * data about a language, not wording anyone should have to translate by hand.
 * Only the surrounding controls are catalog strings.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useCmsStrings, useCmsLocale } from "../../core/hooks/use-cms-strings.js";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, TypeDate } from "../../shared/style/icons.jsx";
import { Popover } from "../../shared/ui/Popover.jsx";
import { faceVariants, slideVariants, staggerGroup, staggerItem } from "../../shared/ui/panel-motion.js";
import { useInteractive } from "../../shared/ui/use-interactive.js";
import { fieldVariant } from "../styles.js";
import { DUR_FAST, EASE, FS_MICRO, FS_XS, FS_SM, R_SM, R_MD } from "../../shared/style/tokens.js";

const BODY_HEIGHT = 192;
const GRID_SPRING = { type: "spring", stiffness: 300, damping: 30 };

/**
 * @param {{
 *   value: string | null | undefined,
 *   onChange: (value: string) => void,
 *   time?: boolean,
 *   disabled?: boolean,
 *   variant?: import("../styles.js").FieldVariantName,
 * }} props
 *   `value` is an ISO 8601 string, empty when unset. `time` adds the hour and
 *   minute strip; leave it off where only the day matters.
 */
export function DatePicker({ value, onChange, time = true, disabled, variant }) {
  const t = useCmsStrings();
  const locale = useCmsLocale();
  const v = fieldVariant(variant);

  const triggerRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(/** @type {number | null} */ (null));
  // Which way the month grid slides, so stepping back animates back.
  const [direction, setDirection] = useState(0);
  const [pickingMonth, setPickingMonth] = useState(false);
  const trigger = useInteractive();

  const selected = useMemo(() => parseIso(value), [value]);
  const [view, setView] = useState(() => firstOfMonth(selected ?? new Date()));

  useEffect(() => {
    if (!open) setPickingMonth(false);
  }, [open]);

  const fmt = useMemo(
    () => new Intl.DateTimeFormat(locale, time
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" }),
    [locale, time],
  );
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(view),
    [locale, view],
  );
  const monthNames = useMemo(() => monthNamesFor(locale), [locale]);
  // Header and grid have to agree on which day starts the week, so both read
  // the same number.
  const weekStart = useMemo(() => firstDayOfWeek(locale), [locale]);
  const weekdays = useMemo(() => weekdayNames(locale, weekStart), [locale, weekStart]);
  const cells = useMemo(() => monthCells(view, weekStart), [view, weekStart]);

  /** Keeps the clock reading when only the day changes, and vice versa. */
  const emit = (/** @type {Date} */ next) => onChange(next.toISOString());

  const stepMonth = (/** @type {number} */ by) => {
    setDirection(by);
    setView(shiftMonth(view, by));
  };

  const stepYear = (/** @type {number} */ by) => {
    setDirection(by);
    setView(new Date(view.getFullYear() + by, view.getMonth(), 1));
  };

  const pickDay = (/** @type {Date} */ day) => {
    const next = new Date(day);
    if (selected) next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    else next.setHours(0, 0, 0, 0);
    emit(next);
    if (!time) setOpen(false);
  };

  const setClock = (/** @type {"h" | "m"} */ part, /** @type {number} */ n) => {
    const base = selected ?? startOfToday();
    const next = new Date(base);
    if (part === "h") next.setHours(clamp(n, 0, 23));
    else next.setMinutes(clamp(n, 0, 59));
    emit(next);
  };

  const today = new Date();
  const lit = open || trigger.focused;

  return (
    <>
      <div ref={triggerRef} style={{ position: "relative", width: "100%" }}>
        <TypeDate
          size={15}
          aria-hidden="true"
          style={{ position: "absolute", left: 12, top: "50%", marginTop: -7, pointerEvents: "none", opacity: 0.4 }}
        />
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setView(firstOfMonth(selected ?? new Date()));
            setOpen((o) => !o);
          }}
          {...trigger.handlers}
          style={{
            ...v.field,
            ...(disabled ? v.disabled : null),
            ...(trigger.hovered && !disabled ? { background: v.hoverBg } : null),
            ...(lit ? { borderColor: v.focusBorder, boxShadow: v.focusShadow } : null),
            display: "flex",
            alignItems: "center",
            width: "100%",
            paddingLeft: 34,
            cursor: disabled ? "not-allowed" : "pointer",
            textAlign: "left",
            transition: `box-shadow ${DUR_FAST} ${EASE}, border-color ${DUR_FAST} ${EASE}, background-color ${DUR_FAST} ${EASE}`,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: selected ? 1 : 0.5 }}>
            {selected ? fmt.format(selected) : t("editors.date.pick")}
          </span>
        </button>
      </div>

      <Popover anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} matchWidth maxHeight={400}>
        <motion.div variants={staggerGroup} style={{ ...v.panel, ...panelStyle }}>
          <motion.div variants={staggerItem} style={{ ...headBarStyle, background: v.hoverBg, borderColor: v.border }}>
            <IconButton
              onClick={() => (pickingMonth ? stepYear(-1) : stepMonth(-1))}
              label={pickingMonth ? t("editors.date.prevYear") : t("editors.date.prevMonth")}
              hoverBg={v.hoverBg}
            >
              {pickingMonth ? <ChevronsLeft size={15} /> : <ChevronLeft size={15} />}
            </IconButton>

            <HeadButton onClick={() => setPickingMonth((s) => !s)} hoverBg={v.hoverBg}>
              {pickingMonth ? view.getFullYear() : monthLabel}
            </HeadButton>

            <IconButton
              onClick={() => (pickingMonth ? stepYear(1) : stepMonth(1))}
              label={pickingMonth ? t("editors.date.nextYear") : t("editors.date.nextMonth")}
              hoverBg={v.hoverBg}
            >
              {pickingMonth ? <ChevronsRight size={15} /> : <ChevronRight size={15} />}
            </IconButton>
          </motion.div>

          <motion.div variants={staggerItem} style={{ position: "relative", height: BODY_HEIGHT, overflow: "hidden" }}>
            <AnimatePresence mode="popLayout" initial={false} custom={pickingMonth}>
              {pickingMonth ? (
                <motion.div
                  key="months"
                  custom={pickingMonth}
                  variants={faceVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, alignContent: "start" }}
                >
                  {monthNames.map((name, idx) => (
                    <MonthButton
                      key={name}
                      current={idx === view.getMonth()}
                      variant={v}
                      onClick={() => {
                        setDirection(idx > view.getMonth() ? 1 : -1);
                        setView(new Date(view.getFullYear(), idx, 1));
                        setPickingMonth(false);
                      }}
                    >
                      {name}
                    </MonthButton>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="calendar"
                  custom={pickingMonth}
                  variants={faceVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}
                >
                  <div style={weekdayRowStyle}>
                    {weekdays.map((w, i) => (
                      <span key={i} style={weekdayStyle}>{w}</span>
                    ))}
                  </div>

                  <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
                    <AnimatePresence initial={false} custom={direction} mode="popLayout">
                      <motion.div
                        key={`${view.getFullYear()}-${view.getMonth()}`}
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={GRID_SPRING}
                        style={gridStyle}
                      >
                        {cells.map(({ date, inMonth }) => {
                          const isSel = selected != null && sameDay(date, selected);
                          const isToday = sameDay(date, today);
                          const key = date.getTime();
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => pickDay(date)}
                              onMouseEnter={() => setHovered(key)}
                              onMouseLeave={() => setHovered(null)}
                              aria-pressed={isSel}
                              style={{
                                ...dayStyle,
                                opacity: inMonth ? 1 : 0.35,
                                ...(isToday && !isSel ? { background: v.hoverBg, boxShadow: `inset 0 0 0 1px ${v.rowRing}` } : null),
                                ...(hovered === key && !isSel ? { background: v.hoverBg } : null),
                                ...(isSel ? v.selected : null),
                              }}
                            >
                              {date.getDate()}
                            </button>
                          );
                        })}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* The clock shares the footer instead of taking a band of its own:
              two digits do not need a full row, and the panel was taller than
              the calendar it exists to show. */}
          <motion.div variants={staggerItem} style={{ ...footRowStyle, borderColor: v.border }}>
            {time ? (
              <Clock
                hour={selected ? selected.getHours() : 0}
                minute={selected ? selected.getMinutes() : 0}
                onHour={(n) => setClock("h", n)}
                onMinute={(n) => setClock("m", n)}
                hourLabel={t("editors.date.hour")}
                minuteLabel={t("editors.date.minute")}
                variant={v}
              />
            ) : <span />}

            <div style={{ display: "flex", gap: 4 }}>
              <FootButton onClick={() => emit(new Date())} hoverBg={v.hoverBg}>{t("editors.date.today")}</FootButton>
              <FootButton onClick={() => { onChange(""); setOpen(false); }} hoverBg={v.hoverBg}>{t("editors.date.clear")}</FootButton>
            </div>
          </motion.div>
        </motion.div>
      </Popover>
    </>
  );
}

/** @param {{ onClick: () => void, label: string, hoverBg: string, children: React.ReactNode }} props */
function IconButton({ onClick, label, hoverBg, children }) {
  const { hovered, focused, handlers } = useInteractive();
  const lit = hovered || focused;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      {...handlers}
      style={{ ...iconBtnStyle, background: lit ? hoverBg : "transparent", opacity: lit ? 1 : 0.55 }}
    >
      {children}
    </button>
  );
}

/** @param {{ onClick: () => void, hoverBg: string, children: React.ReactNode }} props */
function HeadButton({ onClick, hoverBg, children }) {
  const { hovered, focused, handlers } = useInteractive();
  const lit = hovered || focused;
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      style={{ ...headBtnStyle, background: lit ? hoverBg : "transparent" }}
    >
      {children}
    </button>
  );
}

/** @param {{ onClick: () => void, current: boolean, variant: *, children: React.ReactNode }} props */
function MonthButton({ onClick, current, variant, children }) {
  const { hovered, focused, handlers } = useInteractive();
  const lit = hovered || focused;
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      style={{
        ...monthBtnStyle,
        ...(current ? variant.selected : { background: lit ? variant.hoverBg : "transparent", color: "inherit" }),
      }}
    >
      {children}
    </button>
  );
}

/** @param {{ onClick: () => void, hoverBg: string, children: React.ReactNode }} props */
function FootButton({ onClick, hoverBg, children }) {
  const { hovered, focused, handlers } = useInteractive();
  const lit = hovered || focused;
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      style={{ ...footBtnStyle, background: lit ? hoverBg : "transparent", opacity: lit ? 1 : 0.6 }}
    >
      {children}
    </button>
  );
}

/**
 * One bordered pill holding both digits, rather than two full-sized fields
 * with a colon between them.
 *
 * @param {{
 *   hour: number, minute: number,
 *   onHour: (n: number) => void, onMinute: (n: number) => void,
 *   hourLabel: string, minuteLabel: string, variant: *,
 * }} props
 */
function Clock({ hour, minute, onHour, onMinute, hourLabel, minuteLabel, variant }) {
  const { hovered, focused, handlers } = useInteractive();
  return (
    <div
      {...handlers}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        padding: "3px 7px",
        borderRadius: R_SM,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: focused ? variant.focusBorder : variant.border,
        background: hovered || focused ? variant.hoverBg : "transparent",
        boxShadow: focused ? variant.focusShadow : "none",
        transition: `box-shadow ${DUR_FAST} ${EASE}, border-color ${DUR_FAST} ${EASE}, background-color ${DUR_FAST} ${EASE}`,
      }}
    >
      <Digits value={hour} max={23} onChange={onHour} label={hourLabel} />
      <span style={{ opacity: 0.35 }}>:</span>
      <Digits value={minute} max={59} onChange={onMinute} label={minuteLabel} />
    </div>
  );
}

/**
 * Text rather than `type="number"`: at this size the spinner arrows are bigger
 * than the field, and they cannot be styled away from an inline style.
 *
 * @param {{ value: number, max: number, onChange: (n: number) => void, label: string }} props
 */
function Digits({ value, max, onChange, label }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={String(value).padStart(2, "0")}
      aria-label={label}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(-2);
        if (digits === "") return;
        onChange(clamp(Number(digits), 0, max));
      }}
      style={digitsStyle}
    />
  );
}

// ---- Date helpers ----------------------------------------------------------

/** @param {*} iso */
function parseIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** @param {Date} d */
function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** @param {Date} d @param {number} by */
function shiftMonth(d, by) {
  return new Date(d.getFullYear(), d.getMonth() + by, 1);
}

/** @param {Date} a @param {Date} b */
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** @param {number} n @param {number} lo @param {number} hi */
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Which day the week starts on is a property of the locale. `getWeekInfo` is
 * not everywhere yet, so Monday is the fallback: it is right for Turkish and
 * most of Europe, and a wrong guess only rotates the header row.
 *
 * @param {string | undefined} locale
 */
function firstDayOfWeek(locale) {
  try {
    const info = /** @type {*} */ (new Intl.Locale(locale ?? "tr")).getWeekInfo?.();
    return info?.firstDay ?? 1;
  } catch {
    return 1;
  }
}

/**
 * @param {string | undefined} locale
 * @param {number} weekStart  1 = Monday … 7 = Sunday, as `getWeekInfo` reports it.
 */
function weekdayNames(locale, weekStart) {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // 2024-01-01 was a Monday, so offsetting from it walks a whole week.
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(2024, 0, 1 + ((weekStart - 1 + i) % 7))));
}

/** @param {string | undefined} locale */
function monthNamesFor(locale) {
  const fmt = new Intl.DateTimeFormat(locale, { month: "short" });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2024, i, 1)));
}

/**
 * The month as a fixed 42-cell grid. The days either side belong to the
 * neighbouring months and are drawn dimmed rather than left blank: the grid
 * keeps one height all year, and the week rows stay whole.
 *
 * @param {Date} view
 * @param {number} weekStart
 * @returns {{ date: Date, inMonth: boolean }[]}
 */
function monthCells(view, weekStart) {
  const year = view.getFullYear();
  const month = view.getMonth();
  // getDay() counts from Sunday; weekStart counts from Monday. The +7 keeps the
  // result positive whichever way the two are offset.
  const lead = (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(year, month, i - lead + 1);
    return { date, inMonth: date.getMonth() === month };
  });
}

// ---- Styles ---------------------------------------------------------------

const panelStyle = {
  width: "100%",
  borderRadius: R_MD + 4,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const headBarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderRadius: R_SM,
  borderWidth: 1,
  borderStyle: "solid",
  padding: 4,
};
const headBtnStyle = {
  border: "none",
  borderRadius: R_SM - 2,
  padding: "4px 8px",
  color: "inherit",
  font: "inherit",
  fontSize: FS_SM,
  fontWeight: 600,
  textTransform: "capitalize",
  cursor: "pointer",
  transition: `background-color ${DUR_FAST} ${EASE}`,
};
const iconBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  border: "none",
  borderRadius: R_SM - 2,
  color: "inherit",
  cursor: "pointer",
  padding: 0,
  transition: `background-color ${DUR_FAST} ${EASE}, opacity ${DUR_FAST} ${EASE}`,
};
const weekdayRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  marginBottom: 4,
};
// No CSS `text-transform: uppercase`: it casts per the page's language, so an
// English "Fri" under a Turkish document comes back as "FRİ". Intl already
// hands over a properly cased short name for whichever locale asked.
const weekdayStyle = {
  textAlign: "center",
  fontSize: FS_MICRO,
  fontWeight: 500,
  letterSpacing: "0.04em",
  opacity: 0.4,
  padding: "2px 0",
  userSelect: "none",
};
const gridStyle = {
  position: "absolute",
  inset: 0,
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gridAutoRows: "1fr",
  gap: 3,
};
const dayStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  borderRadius: R_SM,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontSize: FS_XS,
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
  cursor: "pointer",
  padding: 0,
  transition: `background-color ${DUR_FAST} ${EASE}`,
};
const monthBtnStyle = {
  border: "none",
  borderRadius: R_SM,
  padding: "9px 4px",
  font: "inherit",
  fontSize: FS_XS,
  fontWeight: 500,
  textTransform: "capitalize",
  cursor: "pointer",
  transition: `background-color ${DUR_FAST} ${EASE}`,
};
const digitsStyle = {
  width: 20,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontSize: FS_XS,
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
  outline: "none",
};
const footRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  paddingTop: 8,
  borderTopWidth: 1,
  borderTopStyle: "solid",
};
const footBtnStyle = {
  padding: "5px 9px",
  border: "none",
  borderRadius: R_SM - 2,
  color: "inherit",
  font: "inherit",
  fontSize: FS_MICRO,
  fontWeight: 500,
  letterSpacing: "0.02em",
  cursor: "pointer",
  transition: `background-color ${DUR_FAST} ${EASE}, opacity ${DUR_FAST} ${EASE}`,
};
