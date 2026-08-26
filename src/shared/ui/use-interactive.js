"use client";

/**
 * @file Hover and keyboard-focus state as values, for controls that style
 * themselves inline.
 *
 * The field editors render in two places: inside the drawer, which injects
 * `panelCss`, and on a host page through `CollectionComposer`, which does not.
 * A `:hover` rule written in the drawer's stylesheet is therefore silently dead
 * in half the places these controls appear, and an inline `style` always
 * out-specificities a class anyway. Tracking the two states in React instead
 * keeps a control's appearance in one place and identical wherever it renders.
 */

import { useState } from "react";

/**
 * @returns {{ hovered: boolean, focused: boolean, handlers: {
 *   onMouseEnter: () => void,
 *   onMouseLeave: () => void,
 *   onFocus: (e: { target: Element }) => void,
 *   onBlur: () => void,
 * } }}
 *   `focused` tracks `:focus-visible`, not focus: a pointer press focuses the
 *   control too, and drawing a ring for that reads as a highlight stuck on.
 */
export function useInteractive() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return {
    hovered,
    focused,
    handlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: (e) => setFocused(matchesFocusVisible(e.target)),
      onBlur: () => setFocused(false),
    },
  };
}

/**
 * Errs towards showing the ring: where `:focus-visible` cannot be evaluated
 * (jsdom, a browser without it) a keyboard user keeping their focus indicator
 * matters more than a mouse user not seeing a stray one.
 *
 * @param {Element} el
 */
function matchesFocusVisible(el) {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}
