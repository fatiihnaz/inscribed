/**
 * @file English wording for the collection panes, record forms and composers.
 *
 * Split by area so the catalogs are not one file every change has to queue
 * behind.  is canonical: a key added here without a counterpart in the
 * other language falls back to English rather than showing a raw key, and the
 * parity test names it.
 */

export const collections = Object.freeze({
  // Shared across the panes, forms and composers.
  "collections.loading": "Loading…",
  "collections.saving": "Saving…",
  "collections.saved": "Saved",
  "collections.error": "Error",
  "collections.clear": "Clear",
  "collections.retry": "Try again",
  "collections.draftBadge": "draft",
  "collections.newBadge": "new",
  "collections.archivedBadge": "archived",
  "collections.create": "Create",
  "collections.creating": "Creating…",

  // Archive and restore.
  "collections.showArchive": "Show the archive",
  "collections.archiveEmpty": "Nothing in the archive.",
  "collections.archiveRecord": "Archive this record",
  "collections.restore": "Restore",
  "collections.archivedNotice": "Archived. Restore it to edit again.",

  // The collections list (rail landing surface).
  "collections.searchCollections": "Search collections",
  "collections.loadingList": "Loading collections…",
  "collections.noSearchResults": "Nothing matched \"{query}\".",
  "collections.noneAccessible": "You can't reach any collection.",
  "collections.fieldCount_one": "{count} field",
  "collections.fieldCount_other": "{count} fields",
  "collections.canCreate": "new records allowed",
  "collections.onThisPage": "on this page",

  // One collection's rows, sections and detail pane.
  "collections.searchRecords": "Search records",
  "collections.noRegionBinding": "This page declares no region binding for {key}.",
  "collections.listFailed": "Could not load the list: {message}",
  "collections.noRecordsForFilter": "No records for this filter.",
  "collections.searchEmpty": "\"{query}\" matched none of the loaded records.",
  "collections.searchScope": "Searched the {loaded} loaded records; {remaining} more to load.",
  "collections.loadMore": "Load more ({remaining} left)",
  "collections.allRecords": "All",
  "collections.sortBy": "Sort by",
  "collections.sortSlug": "Slug",
  "collections.sortCreatedAt": "Created",
  "collections.sortUpdatedAt": "Updated",
  "collections.sortAsc": "Ascending",
  "collections.sortDesc": "Descending",
  "collections.backToList": "Back to the list",
  "collections.backToListTitle": "Back to the list (Esc)",
  "collections.addTranslation": "Add the {locale} translation",
  "collections.viewLocale": "Language",
  "collections.viewLocaleIs": "Work in {locale}",
  "collections.undoRecord": "Undo this record's changes",
  "collections.newRecordIn": "New {key}",
  "collections.newRecordInLocale": "New {key} · {locale}",
  "collections.slugLabel": "Slug",
  "collections.slugPlaceholder": "spring-festival",

  // The record form.
  "collections.accessFailed": "Could not load the access list: {message}",
  "collections.recordFailed": "Could not load {collection}/{slug}: {message}",
  "collections.noAccess": "You have no access to the {key} collection in this session, so you can't edit it.",
  "collections.newRecord": "New record",
  "collections.version": "Version {version}",
  "collections.virtualHint": "This record doesn't exist yet; the first Save creates it.",

  // Schema-driven fields.
  "collections.emptySchema": "The schema is empty.",
  "collections.requiredField": "required",
  "collections.computedField": "computed",
  "collections.selectOption": "— select —",
  "collections.editorLoading": "Loading the editor…",
  "collections.itemFallback": "item",
  "collections.noItems": "No items yet.",
  "collections.removeNamed": "Remove \"{item}\"",
  "collections.remove": "Remove",
  "collections.add": "Add",
  "collections.addNamed": "Add {name}",
  "collections.addNamedPlaceholder": "Add {name}…",
  "collections.emptyItem": "Empty item",
  "collections.moveUp": "Move up",
  "collections.moveDown": "Move down",
  "collections.deleteItemAt": "Delete item #{index}",

  // Page-side record chrome.
  "collections.undoRecordDraft": "Undo this record's draft",
  "collections.publishRecord": "Publish this record",
  "collections.openInPanel": "Open in the panel",
  "collections.openRecordInPanel": "Open the {label} record in the panel",
  "collections.createdNotice": "Saved.",

  // Save and create failures.
  "collections.requiredMissing": "A required field is missing: {field}",
  "collections.invalidData": "Invalid data: {detail}",
  "collections.versionConflict": "Version conflict. The list has been refreshed, check it and try again.",
  "collections.archivedConflict": "This record is archived, so it can't be written to. Restore it first.",
  "collections.editForbidden": "You don't have rights to edit this record.",
  "collections.createRace": "Another write landed at the same time. Try again.",
  "collections.slugMissing": "This collection needs a slug for the new record.",
  "collections.slugTaken": "A record already lives at that slug. Pick another, or open the existing one to edit it.",
  "collections.createForbidden": "You don't have rights to create records in this collection.",
  "collections.unknownField": "Unknown field: {field}",
});
