/**
 * @file English wording for the page-side region and list chrome.
 *
 * Split by area so the catalogs are not one file every change has to queue
 * behind.  is canonical: a key added here without a counterpart in the
 * other language falls back to English rather than showing a raw key, and the
 * parity test names it.
 */

export const core = Object.freeze({
  // The label chip a hovered or selected region/list carries on the page.
  "core.chip.open": "Open in the panel",
  "core.chip.openBlock": "Open the {path} block in the panel",
  "core.chip.openList": "Open the {path} list in the panel",

  "core.text.placeholder": "Add text…",

  // Per-item controls on an admin-mode list. Which pair of move labels applies
  // is decided at hover time from the items' own boxes: a list laid out in a
  // flex row moves left and right, not up and down.
  "core.item.moveUp": "Move up",
  "core.item.moveDown": "Move down",
  "core.item.moveLeft": "Move left",
  "core.item.moveRight": "Move right",
  "core.item.reorder": "Drag to reorder",
  "core.item.position": "Item {index} of {total}",
  "core.item.moveTo": "Type a position to move it there",
  "core.item.remove": "Delete",
  "core.item.add": "Add item",
  "core.item.addLabel": "Add a new item",

  // Mode named beside a group's hover label.
  "core.group.hidden": "Hidden",

  // The notice raised when an editor's session dies mid-edit.
  "core.session.expired": "Your session has ended. Sign in again to keep editing.",
  "core.session.signIn": "Sign in",
});
