// @vitest-environment jsdom
/**
 * The rich text editor's module is fetched once. After that a rich text field
 * shows its editor on its first commit instead of a loading line: React 19
 * holds a suspended editor back for up to 300 ms, which made a shut drawer row
 * open onto the placeholder and jump to full height a moment later.
 */
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { FieldEditor } from "../../editors/FieldEditor.jsx";
import { loadRichTextEditor } from "../../editors/rich-text/lazy-rich-text-editor.jsx";

afterEach(() => {
  cleanup();
});

describe("a rich text field after the editor's module has arrived", () => {
  it("renders the editor on its first commit", async () => {
    await loadRichTextEditor();
    const { container } = render(
      <CmsProvider config={{ baseUrl: "https://api.test", adminLocale: "en" }}>
        <FieldEditor blockType="RichText" value="<p>Bir</p>" onChange={() => {}} />
      </CmsProvider>,
    );

    expect(container.querySelector(".inscribed-rte-shell")).toBeTruthy();
    expect(container.textContent).not.toContain("Loading the editor");
  });
});
