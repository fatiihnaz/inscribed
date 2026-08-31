/**
 * @file The collection panel's pure helpers: which field headlines a row, which
 * columns the collection can be sorted by, how old a record reads, and how a
 * `sort` string splits.
 *
 * They lived inside the panel component and had no coverage of their own. The
 * interesting cases are all edge ones (a schema with nothing textual, a clock
 * skewed ahead of the server, a draft title that differs from the saved one),
 * which a render test reaches only indirectly.
 */
import { describe, it, expect } from "vitest";

import {
  titleFieldName, sortableColumns, shortAge, itemTitle, splitSort,
  imageFieldName, itemImage,
} from "../../admin/collection/collection-format.js";

/**
 * @param {string} name
 * @param {string} type
 * @param {object} [extra]
 */
const f = (name, type, extra = {}) => ({
  name,
  type,
  label: null,
  required: false,
  readOnly: false,
  sortable: false,
  filterable: false,
  source: null,
  itemFields: null,
  help: null,
  ...extra,
});

/** Echoes the key so an assertion names the wording it expects, not the copy. */
const t = (/** @type {string} */ key, /** @type {*} */ vars) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** @param {number} ms  How long ago. */
const ago = (ms) => new Date(Date.now() - ms).toISOString();

describe("titleFieldName", () => {
  it("prefers the conventional title names over an earlier textual field", () => {
    const schema = { fields: [f("summary", "ShortText"), f("title", "ShortText")] };
    expect(titleFieldName(schema)).toBe("title");
  });

  it("reads the conventional names in their own priority order", () => {
    const schema = { fields: [f("ad", "ShortText"), f("name", "ShortText")] };
    expect(titleFieldName(schema)).toBe("name");
  });

  // Matched case-insensitively but reported verbatim: the answer addresses a
  // key in the record's data, so the schema's own spelling is the only one that
  // reads it.
  it("matches a conventional name in any case and answers with the schema's own", () => {
    expect(titleFieldName({ fields: [f("Title", "ShortText")] })).toBe("Title");
  });

  it("falls back to the first textual field", () => {
    const schema = { fields: [f("count", "Number"), f("body", "LongText"), f("note", "ShortText")] };
    expect(titleFieldName(schema)).toBe("body");
  });

  // Null is a real answer: the row then shows its slug rather than being handed
  // a number or a date dressed up as a headline.
  it("answers null when the schema has nothing textual", () => {
    const schema = { fields: [f("count", "Number"), f("live", "Bool")] };
    expect(titleFieldName(schema)).toBeNull();
  });

  it("answers null for a missing or empty schema", () => {
    expect(titleFieldName(null)).toBeNull();
    expect(titleFieldName(undefined)).toBeNull();
    expect(titleFieldName({ fields: [] })).toBeNull();
  });
});

describe("sortableColumns", () => {
  it("always offers the three the backend carries", () => {
    expect(sortableColumns(null).map((c) => c.value)).toEqual(["slug", "createdAt", "updatedAt"]);
  });

  it("adds the schema's own sortable fields after them", () => {
    const schema = {
      fields: [f("title", "ShortText"), f("publishedAt", "Date", { sortable: true, label: "Yayın" })],
    };
    const cols = sortableColumns(schema);
    expect(cols.map((c) => c.value)).toEqual(["slug", "createdAt", "updatedAt", "publishedAt"]);
    // The base three are named through the catalog, a schema column by itself.
    expect(cols.at(-1)).toEqual({ value: "publishedAt", label: "Yayın" });
  });

  it("names an unlabelled schema column by its field name", () => {
    const schema = { fields: [f("weight", "Number", { sortable: true })] };
    expect(sortableColumns(schema).at(-1)).toEqual({ value: "weight", label: "weight" });
  });
});

describe("shortAge", () => {
  it("has nothing to say without a timestamp", () => {
    expect(shortAge(undefined, t)).toBeNull();
    expect(shortAge("not a date", t)).toBeNull();
  });

  it("reads anything under a minute as now", () => {
    expect(shortAge(ago(5_000), t)).toBe("collections.timeNow");
  });

  // A clock a little ahead of the server would otherwise render "-0m".
  it("reads a future stamp as now rather than a negative span", () => {
    expect(shortAge(new Date(Date.now() + 30_000).toISOString(), t)).toBe("collections.timeNow");
  });

  it("steps through minutes, hours and days", () => {
    expect(shortAge(ago(5 * MINUTE), t)).toBe('collections.timeMinutes:{"n":5}');
    expect(shortAge(ago(3 * HOUR), t)).toBe('collections.timeHours:{"n":3}');
    expect(shortAge(ago(3 * DAY), t)).toBe('collections.timeDays:{"n":3}');
  });

  // Past a week "23d" stops being a span anyone can picture.
  it("switches to a plain date after a week", () => {
    const iso = ago(9 * DAY);
    expect(shortAge(iso, t)).toBe(new Date(iso).toLocaleDateString());
  });
});

describe("itemTitle", () => {
  const item = { data: { title: "Kayıtlı" } };

  it("reads the named field", () => {
    expect(itemTitle(item, "title")).toBe("Kayıtlı");
  });

  // While a record is being edited, its draft title is what the list should say.
  it("prefers the draft over the saved value", () => {
    expect(itemTitle({ ...item, draftData: { title: "Taslak" } }, "title")).toBe("Taslak");
  });

  it("has nothing to read without a field", () => {
    expect(itemTitle(item, null)).toBeNull();
  });

  it("treats blank and non-string values as no title", () => {
    expect(itemTitle({ data: { title: "   " } }, "title")).toBeNull();
    expect(itemTitle({ data: { title: 42 } }, "title")).toBeNull();
    expect(itemTitle({ data: {} }, "title")).toBeNull();
  });
});

describe("splitSort", () => {
  it("splits the column from the direction", () => {
    expect(splitSort("publishedAt:desc")).toEqual(["publishedAt", "desc"]);
  });

  // Defaulted the way the backend does: anything that isn't "desc" ascends.
  it("ascends for a bare column or an unknown direction", () => {
    expect(splitSort("slug")).toEqual(["slug", "asc"]);
    expect(splitSort("slug:sideways")).toEqual(["slug", "asc"]);
  });
});

describe("imageFieldName", () => {
  it("takes the first Image the schema declares", () => {
    const schema = { fields: [f("title", "ShortText"), f("cover", "Image"), f("gallery", "Image")] };
    expect(imageFieldName(schema)).toBe("cover");
  });

  // Null is what drops the thumbnail column entirely, rather than lining every
  // row up behind an empty one.
  it("answers null when the schema declares no image", () => {
    expect(imageFieldName({ fields: [f("title", "ShortText")] })).toBeNull();
    expect(imageFieldName(null)).toBeNull();
    expect(imageFieldName({ fields: [] })).toBeNull();
  });
});

describe("itemImage", () => {
  const item = { data: { cover: { src: "/a.jpg", alt: "" } } };

  it("reads the src out of the Image value", () => {
    expect(itemImage(item, "cover")).toBe("/a.jpg");
  });

  it("prefers the draft, like the headline does", () => {
    const drafted = { ...item, draftData: { cover: { src: "/b.jpg", alt: "" } } };
    expect(itemImage(drafted, "cover")).toBe("/b.jpg");
  });

  // A declared field the record never filled in. Null rather than an empty
  // string: the row draws a placeholder, not an <img> the browser marks broken.
  it("answers null for an unfilled or malformed value", () => {
    expect(itemImage({ data: {} }, "cover")).toBeNull();
    expect(itemImage({ data: { cover: null } }, "cover")).toBeNull();
    expect(itemImage({ data: { cover: { src: "" } } }, "cover")).toBeNull();
    expect(itemImage({ data: { cover: { src: "   " } } }, "cover")).toBeNull();
    expect(itemImage({ data: { cover: "/a.jpg" } }, "cover")).toBeNull();
  });

  it("has nothing to read without a field", () => {
    expect(itemImage(item, null)).toBeNull();
  });
});
