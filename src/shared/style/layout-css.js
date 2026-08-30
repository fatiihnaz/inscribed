/**
 * @file The panel's width at each size, and how the page gets out of its way.
 *
 * CSS rather than an inline style because the shell wraps the host's children:
 * it renders on the server and ships in the public bundle, so a breakpoint
 * expressed in JS would cost either a resize listener and a hydration mismatch,
 * or `matchMedia` for visitors who never see a drawer. The panel keeps one
 * shape at every size, so these widths are the whole of the responsive layout.
 */

import {
  DUR_PANEL, EASE, FS_SCALE_MOBILE, MOBILE_QUERY, NARROW_QUERY,
  PANEL_W, PANEL_WIDTH_MOBILE, PANEL_WIDTH_NARROW,
} from "./tokens.js";

export const PAGE_SHELL_CLASS = "inscribed-page-shell";

export const layoutCss = `
  /* Both the panel and the shell below read this, and the drawer that owns the
     panel is lazy: defined here, the width is right on the first paint rather
     than once the admin chunk lands. */
  @media ${NARROW_QUERY} {
    :root { --ins-panel-w: ${PANEL_WIDTH_NARROW}px; }
  }
  @media ${MOBILE_QUERY} {
    :root {
      --ins-panel-w: ${PANEL_WIDTH_MOBILE};
      /* Lifts the whole type ramp at once. The desktop steps are dense-chrome
         sizes, and iOS zooms the page whenever a focused control's text lands
         under 16px, which all of them do. Scaling the ramp rather than the
         controls alone is what keeps a field the same size as its own label. */
      --ins-fs-scale: ${FS_SCALE_MOBILE};
    }
  }

  .${PAGE_SHELL_CLASS} {
    transition: margin ${DUR_PANEL} ${EASE};
  }
  .${PAGE_SHELL_CLASS}[data-drawer-open="true"] {
    margin-left: ${PANEL_W};
  }

  /* The panel covers the page at this size, so pushing it aside would move
     nothing anyone can see and only add a scrollbar. */
  @media ${MOBILE_QUERY} {
    .${PAGE_SHELL_CLASS}[data-drawer-open="true"] {
      margin-left: 0;
    }
  }

  /* The drawer's own stylesheet covers this class too, but ships in the lazy
     admin chunk; repeating the rule keeps the shell correct on its own. */
  @media (prefers-reduced-motion: reduce) {
    .${PAGE_SHELL_CLASS} { transition-duration: 1ms; }
  }
`;
