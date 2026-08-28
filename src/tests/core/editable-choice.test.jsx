// @vitest-environment jsdom
/**
 * @file `<EditableChoice>`: a block plus the vocabulary its value came from.
 *
 * The vocabulary never reaches the backend, so the assertions go through what
 * the drawer would find in the registry and what the options resolve to, not
 * through anything on the wire.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import { CmsProvider } from "../../core/CmsProvider.jsx";
import { EditableChoice } from "../../core/EditableChoice.jsx";
import { CmsGroup } from "../../core/CmsGroup.jsx";
import { useCmsContext } from "../../shared/state/cms-context.js";
import { useStoreSelector } from "../../shared/state/store.js";

const BASE = "https://api.test";

/** @param {string} blockPath @param {string} blockType @param {*} value */
const mk = (blockPath, blockType, value) => ({
  blockPath, blockType, value, draftValue: null, version: 1, sortOrder: 1, _slug: "/",
});

const BLOCKS = [
  mk("post.durum", "Select", "taslak"),
  mk("hero.durum", "Select", "yayında"),
  // The two shapes a block source can point at.
  mk("vocab.etiketler", "StringArray", ["haber", "duyuru", "", "haber"]),
  mk("vocab.haberler", "ObjectArray", [
    { baslik: "Birinci", ozet: "…" },
    { baslik: "İkinci", ozet: "…" },
    { baslik: "", ozet: "boş satır" },
  ]),
];

/** Reports the registry entry the drawer keys by path. */
function Registered({ blockPath }) {
  const { registryStore } = useCmsContext();
  const entry = useStoreSelector(registryStore, (s) => s.choiceSources.get(blockPath) ?? null);
  return <div data-testid="entry">{entry ? entry.source.kind : "none"}</div>;
}

/** What the drawer would be offered: a block source is resolved before it lands. */
function Options({ blockPath }) {
  const { registryStore } = useCmsContext();
  const entry = useStoreSelector(registryStore, (s) => s.choiceSources.get(blockPath) ?? null);
  const values = entry?.source.kind === "static" ? entry.source.values : [];
  return <div data-testid="options">{values.join("|") || "none"}</div>;
}

/** @param {{ isAdmin?: boolean, children: React.ReactNode }} props */
const App = ({ isAdmin, children }) => (
  <CmsProvider config={{ baseUrl: BASE }} isAdmin={isAdmin} initialBlocks={BLOCKS}>
    {children}
  </CmsProvider>
);

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ slug: "/", blocks: [] })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EditableChoice", () => {
  it("renders the stored value and registers its vocabulary", () => {
    render(
      <App isAdmin>
        <Registered blockPath="post.durum" />
        <EditableChoice
          blockPath="post.durum"
          defaultValue="taslak"
          source={{ kind: "static", values: ["taslak", "yayında"] }}
        />
      </App>,
    );
    expect(screen.getByText("taslak")).toBeTruthy();
    expect(screen.getByTestId("entry").textContent).toBe("static");
  });

  it("lets the caller render the value instead", () => {
    render(
      <App isAdmin>
        <EditableChoice
          blockPath="post.durum"
          defaultValue="taslak"
          source={{ kind: "static", values: ["taslak"] }}
        >
          {(value) => <em>durum: {value}</em>}
        </EditableChoice>
      </App>,
    );
    expect(screen.getByText("durum: taslak")).toBeTruthy();
  });

  it("registers under the group prefix the drawer keys by", () => {
    render(
      <App isAdmin>
        <Registered blockPath="hero.durum" />
        <CmsGroup name="hero">
          <EditableChoice
            blockPath="durum"
            defaultValue=""
            source={{ kind: "static", values: ["yayında"] }}
          />
        </CmsGroup>
      </App>,
    );
    expect(screen.getByTestId("entry").textContent).toBe("static");
    expect(screen.getByText("yayında")).toBeTruthy();
  });

  it("carries the region chrome, chip and all", () => {
    const { container } = render(
      <App isAdmin>
        <EditableChoice blockPath="post.durum" defaultValue="" source={{ kind: "static", values: [] }} />
      </App>,
    );
    const wrapper = container.querySelector("span");
    fireEvent.mouseEnter(wrapper);
    expect(container.querySelector("button").textContent).toContain("post.durum");
  });

  it("adds nothing for a visitor", () => {
    const { container } = render(
      <App>
        <EditableChoice blockPath="post.durum" defaultValue="" source={{ kind: "static", values: [] }} />
      </App>,
    );
    expect(container.querySelector("button")).toBeNull();
    expect(screen.getByText("taslak")).toBeTruthy();
  });
});

describe("a block source", () => {
  /** @param {*} source */
  const options = (source) => {
    render(
      <App isAdmin>
        <Options blockPath="post.durum" />
        <EditableChoice blockPath="post.durum" defaultValue="" source={source} />
      </App>,
    );
    return screen.getByTestId("options").textContent;
  };

  it("offers a StringArray block's entries, blanks and repeats dropped", () => {
    expect(options({ kind: "block", blockPath: "vocab.etiketler" })).toBe("haber|duyuru");
  });

  it("offers one field of an ObjectArray's rows", () => {
    expect(options({ kind: "block", blockPath: "vocab.haberler", labelField: "baslik" }))
      .toBe("Birinci|İkinci");
  });

  it("offers nothing when the row field was never named", () => {
    expect(options({ kind: "block", blockPath: "vocab.haberler" })).toBe("none");
  });

  it("offers nothing when the source block is not on this page", () => {
    expect(options({ kind: "block", blockPath: "yok.boyle.bir.sey" })).toBe("none");
  });

  it("reaches the registry as a plain static list, so nothing downstream knows", () => {
    render(
      <App isAdmin>
        <Registered blockPath="post.durum" />
        <EditableChoice
          blockPath="post.durum"
          defaultValue=""
          source={{ kind: "block", blockPath: "vocab.etiketler" }}
        />
      </App>,
    );
    expect(screen.getByTestId("entry").textContent).toBe("static");
  });
});
