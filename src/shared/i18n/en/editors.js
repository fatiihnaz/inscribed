/**
 * @file English wording for the field editors and the inline page-side affordances.
 *
 * Split by area so the catalogs are not one file every change has to queue
 * behind.  is canonical: a key added here without a counterpart in the
 * other language falls back to English rather than showing a raw key, and the
 * parity test names it.
 */

export const editors = Object.freeze({
  // Image editing, shared by the drawer's ImageEditor and the page-side overlay
  // and placeholder.
  "editors.image.replace": "Replace",
  "editors.image.remove": "Remove",
  "editors.image.empty": "No image",
  "editors.image.upload": "Upload an image",
  "editors.image.uploadHint": "click or drag and drop",
  "editors.image.drop": "Drop it here",
  "editors.image.uploading": "Uploading {percent}%",
  "editors.image.processing": "Processing…",
  "editors.image.dismissError": "Dismiss the error",
  "editors.image.url": "Image URL",
  "editors.image.alt": "Alt text",
  "editors.image.altPlaceholder": "Describe the image",

  // The upload flow's own failures.
  "editors.upload.notImage": "Please pick an image file.",
  "editors.upload.noUrl": "The CDN response carried no url",
  "editors.upload.failed": "Upload failed.",

  // Field labels for the single-value block editors.
  "editors.text.label": "Text",
  "editors.richText.label": "Rich text",
  "editors.link.label": "Label",
  "editors.link.url": "URL",
  "editors.url.suspect": "This does not look like a link. It will still be saved.",

  // List block editor.
  "editors.list.noSchema": "No {schema} found for this list. Is {component} rendered on the page?",
  "editors.list.empty": "This list is empty. Start with the \"+ Add item\" button.",
  "editors.list.addItem": "Add item",
  "editors.list.emptyItem": "Empty item",
  "editors.list.moveUp": "Move up",
  "editors.list.moveDown": "Move down",
  "editors.list.delete": "Delete",
  "editors.list.unsupportedField": "The {type} type is not supported in a list itemSchema.",

  // Rich text. The `*Title` variants carry the keyboard shortcut; the bare key
  // is what a screen reader announces.
  "editors.richText.loading": "Loading the editor…",
  "editors.richText.bold": "Bold",
  "editors.richText.boldTitle": "Bold (Ctrl+B)",
  "editors.richText.italic": "Italic",
  "editors.richText.italicTitle": "Italic (Ctrl+I)",
  "editors.richText.strike": "Strikethrough",
  "editors.richText.code": "Inline code",
  "editors.richText.heading2": "Heading 2",
  "editors.richText.heading3": "Heading 3",
  "editors.richText.bulletList": "Bullet list",
  "editors.richText.orderedList": "Numbered list",
  "editors.richText.quote": "Quote",
  "editors.richText.link": "Link",
  "editors.richText.linkPrompt": "Link URL",
  "editors.richText.undo": "Undo",
  "editors.richText.undoTitle": "Undo (Ctrl+Z)",
  "editors.richText.redo": "Redo",
  "editors.richText.redoTitle": "Redo (Ctrl+Shift+Z)",

  // Date block editor, including the countdown's unit captions.
  "editors.date.label": "Date and time",
  // Month and weekday names come from Intl; only the surrounding controls are
  // catalog strings.
  "editors.date.pick": "Pick a date",
  "editors.date.prevMonth": "Previous month",
  "editors.date.nextMonth": "Next month",
  "editors.date.prevYear": "Previous year",
  "editors.date.nextYear": "Next year",
  "editors.date.hour": "Hour",
  "editors.date.minute": "Minute",
  "editors.date.today": "Today",
  "editors.date.clear": "Clear",
  "editors.date.past": "This date has passed.",
  "editors.date.days": "days",
  "editors.date.hours": "hours",
  "editors.date.minutes": "mins",

  // Picking from a list: the same box serves a fixed vocabulary and the records
  // of another collection.
  "editors.combobox.choose": "Choose an option",
  "editors.combobox.add": "Add",
  "editors.combobox.search": "Search…",
  "editors.combobox.loading": "Searching…",
  "editors.combobox.empty": "Nothing matches",
  // The descriptive one names the trigger's icon button, where nothing else
  // says what it clears; the short one is the panel footer's visible label.
  "editors.combobox.clear": "Clear the selection",
  "editors.combobox.clearAction": "Clear",
  "editors.combobox.prevPage": "Previous page",
  "editors.combobox.nextPage": "Next page",
  "editors.combobox.noSource": "This field has no choice source. Is it declared on the page?",
  "editors.combobox.create": "Add \"{text}\"",
});
