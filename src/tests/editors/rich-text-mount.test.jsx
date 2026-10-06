// @vitest-environment jsdom
/**
 * Opening a rich text editor is not an edit. Tiptap rewrites HTML it did not
 * write itself (`<li>x</li>` becomes `<li><p>x</p></li>`), and reporting that
 * as a change put a draft in the backend for a block nobody touched.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import { EditorContent } from "@tiptap/react";

import { useRichTextEditor } from "../../editors/rich-text/use-rich-text-editor.js";

const REWRITTEN = "<ul><li>Bir</li><li>İki</li></ul>";

function Harness({ value, onChange, disabled, onEditor }) {
  const editor = useRichTextEditor({ value, onChange, disabled });
  React.useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return <EditorContent editor={editor} />;
}

async function mount(props) {
  let editor = null;
  const onEditor = (e) => { editor = e; };
  const view = render(<Harness onEditor={onEditor} {...props} />);
  await waitFor(() => expect(editor).not.toBeNull());
  return { editor, rerender: (next) => view.rerender(<Harness onEditor={onEditor} {...props} {...next} />) };
}

afterEach(() => {
  cleanup();
});

describe("a rich text editor opening on HTML it rewrites", () => {
  it("reports nothing", async () => {
    const onChange = vi.fn();
    const { editor } = await mount({ value: REWRITTEN, onChange });

    expect(editor.getHTML()).not.toBe(REWRITTEN);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports nothing when it is locked or unlocked", async () => {
    const onChange = vi.fn();
    const { rerender } = await mount({ value: REWRITTEN, onChange, disabled: false });

    act(() => rerender({ disabled: true }));
    act(() => rerender({ disabled: false }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("still reports a real edit", async () => {
    const onChange = vi.fn();
    const { editor } = await mount({ value: REWRITTEN, onChange });

    act(() => {
      editor.commands.insertContent("<p>Üç</p>");
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toContain("Üç");
  });
});

describe("a rich text editor re-rendered with nothing changed", () => {
  // Each `setOptions` re-applies the editor's props to the view, which a hover
  // on the page region or any drawer re-render used to cost every editor.
  it("leaves the editor's options alone", async () => {
    const onChange = vi.fn();
    const { editor, rerender } = await mount({ value: "<p>Bir</p>", onChange });
    const setOptions = vi.spyOn(editor, "setOptions");

    act(() => rerender({}));

    expect(setOptions).not.toHaveBeenCalled();
  });
});
