/**
 * @file How the page shell gets out of the drawer's way.
 *
 * CSS rather than an inline style because the shell wraps the host's children:
 * it renders on the server and ships in the public bundle, so a breakpoint
 * expressed in JS would cost either a resize listener and a hydration mismatch,
 * or `matchMedia` for visitors who never see a drawer. The same split holds for
 * the rest of the responsive work: layout through custom properties and media
 * queries, behaviour through `matchMedia` in the admin-only chunk.
 */

import { DUR_PANEL, EASE, PANEL_W } from "./tokens.js";

export const PAGE_SHELL_CLASS = "inscribed-page-shell";

export const layoutCss = `
  .${PAGE_SHELL_CLASS} {
    transition: margin-left ${DUR_PANEL} ${EASE};
  }
  .${PAGE_SHELL_CLASS}[data-drawer-open="true"] {
    margin-left: ${PANEL_W};
  }

  /* The drawer's sheet covers this class too, but ships in the lazy admin
     chunk; repeating the rule keeps the shell correct on its own. */
  @media (prefers-reduced-motion: reduce) {
    .${PAGE_SHELL_CLASS} { transition-duration: 1ms; }
  }
`;
