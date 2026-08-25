/**
 * @file English wording for the drawer shell, block cards, conflicts, translations and the changes preview.
 *
 * Split by area so the catalogs are not one file every change has to queue
 * behind.  is canonical: a key added here without a counterpart in the
 * other language falls back to English rather than showing a raw key, and the
 * parity test names it.
 */

export const panel = Object.freeze({
  // Status bar and the header's autosave pill.
  "status.publishing": "Publishing…",
  "status.draftSaving": "Saving draft…",
  "status.draftFailed": "Draft could not be saved",
  "status.clean": "No changes",
  "status.unsaved_one": "{count} unsaved change",
  "status.unsaved_other": "{count} unsaved changes",
  "status.unsavedSplit": "{content} / {collection} unsaved changes",
  "status.collectionDrafts_one": "{count} collection draft",
  "status.collectionDrafts_other": "{count} collection drafts",
  "status.save": "Save",
  "status.discard": "Discard",
  "status.preview": "Preview",
  "status.closePreview": "Close preview",
  "status.openCollection": "Open collection",

  "pill.failed": "Not saved",
  "pill.failedTitle": "Draft could not be saved",
  "pill.published": "Data saved",
  "pill.publishedTitle": "Every change is live",
  "pill.publishing": "Publishing…",
  "pill.publishingTitle": "Publishing your changes",
  "pill.draftSaved": "Draft saved",
  "pill.draftSavedTitle": "Draft last saved at {time}",
  "pill.draftSaving": "Saving draft…",
  "pill.draftSavingTitle": "Saving the draft now",

  // Drawer shell: rail, header path, tab bar, search, preview header, footer.
  "drawer.page": "Page",
  "drawer.global": "Global",
  "drawer.collections": "Collections",
  "drawer.sections": "Sections",
  "drawer.location": "Location",
  "drawer.home": "Home",
  "drawer.collectionList": "Collection list",
  "drawer.unsavedDot": "Has unsaved changes",
  "drawer.pendingDot": "Has something pending",
  "drawer.openPanel": "Open the panel",
  "drawer.closePanel": "Close the panel",
  "pill.dirty": "Editing",
  "pill.dirtyTitle": "You have unsaved changes",
  "drawer.tabsPrev": "Previous tabs",
  "drawer.tabsNext": "Next tabs",
  "drawer.searchPlaceholder": "Search blocks (path or type)",
  "drawer.searchLabel": "Search blocks",
  "drawer.searchClear": "Clear",
  "drawer.emptySearch": "Nothing matches \"{query}\".",
  "drawer.emptyPage": "No editable blocks on this page. Run the manifest sync to pick up new ones.",
  "drawer.emptyGlobal": "No blocks are marked scope=\"global\" yet.",
  "drawer.backToEditing": "Back to editing",
  "drawer.previewTitle_one": "{count} change",
  "drawer.previewTitle_other": "{count} changes",
  "drawer.discardAll": "Discard all changes",
  "drawer.saveAll": "Save all",
  "drawer.open": "Open",
  "drawer.openRecord": "Open the {key} / {slug} record",
  "drawer.anonymous": "Anonymous",
  "drawer.signOut": "Sign out",

  // Block cards.
  "block.unsavedDot": "Unsaved change",
  "block.undo": "Undo",
  "block.undoThis": "Undo this block's changes",
  "block.readOnly": "Read-only",
  "block.readOnlyTitle": "Read-only (editable={false})",
  "block.items": "{count} items",
  "block.noEditor": "No inline editor for the {type} type yet.",
  "block.invalidCollection": "This Collection block has an invalid binding: it does not carry the expected {shape} shape.",

  // Conflict resolution.
  "conflict.title": "Someone published this block while you were editing it",
  "conflict.label": "Save conflict",
  "conflict.takeTheirs": "Take theirs",
  "conflict.keepMine": "Keep mine",

  // The translation prompt.
  "translations.title": "This text has not changed in the other languages",
  "translations.label": "Copies in the other languages",
  "translations.dismiss": "Dismiss",
  "translations.dismissLabel": "Dismiss this reminder",
  "translations.undoAll": "Undo",
  "translations.undoAllLabel": "Undo the translations written here",
  "translations.undoOne": "Undo the {locale} translation",
  "translations.missing": "This language has no such block",
  "translations.tooMany": "There are {count} more languages. Editing each on its own page beats fitting them all in here: {list}.",

  // Changes preview.
  "changes.empty": "No changes yet.",
  "changes.drafts": "{count} drafts",
  "changes.openCollection": "Open the {key} collection",
  "changes.editBlock": "Edit the {path} block",
  "changes.editBlockTitle": "Edit this block",
  "changes.noVisibleChange": "No visible change.",
  "changes.formatOnly": "The text is the same, only the formatting changed.",
  "changes.wordsHidden": "{count} words hidden",
  "changes.linesHidden": "{count} lines hidden",
  "changes.charsHidden": "… {count} characters …",
  "changes.charsHiddenLabel": "{count} characters hidden",
  "changes.added": "Added",
  "changes.removed": "Deleted",
  "changes.moved": "Moved",
  "changes.changed": "Edited",
  "changes.published": "Live",
  "changes.draft": "Draft",

  // Save failures, as the drawer's banner phrases them.
  "saveError.generic": "Could not be saved",
  "saveError.conflict_one": "{count} block was updated while you were editing. It is flagged below: compare the two versions and pick the one to keep.",
  "saveError.conflict_other": "{count} blocks were updated while you were editing. Each is flagged below: compare the two versions and pick the one to keep.",
  "saveError.race": "Another write landed at the same time. The page has been refreshed, try again.",
  "saveError.forbidden": "Not permitted. You do not have rights to edit this content.",

  // Formatting marks, named when a RichText edit touched only the markup.
  "changes.mark.bold": "bold",
  "changes.mark.italic": "italic",
  "changes.mark.strike": "strikethrough",
  "changes.mark.link": "link",
  "changes.mark.heading": "heading",
  "changes.mark.subheading": "subheading",
  "changes.mark.quote": "quote",
  "changes.mark.listItem": "list item",
  "changes.mark.code": "code",
});
