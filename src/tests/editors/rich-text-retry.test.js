/**
 * The drawer warms the rich text editor's module up while the browser is idle.
 * A warm-up that fails must not stick: the module promise is shared, so a kept
 * rejection broke every rich text field for the rest of the page's life.
 */
import { describe, it, expect, vi } from "vitest";

const attempts = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../editors/rich-text/RichTextEditor.jsx", () => {
  attempts.count += 1;
  if (attempts.count === 1) throw new Error("chunk failed to load");
  return { RichTextEditor: () => null };
});

import { loadRichTextEditor, prefetchRichTextEditor } from "../../editors/rich-text/lazy-rich-text-editor.jsx";

describe("a rich text warm-up that fails", () => {
  it("leaves the next load free to try again", async () => {
    prefetchRichTextEditor();
    await expect(loadRichTextEditor()).rejects.toThrow();

    await expect(loadRichTextEditor()).resolves.toBeTypeOf("function");
    expect(attempts.count).toBe(2);
  });
});
