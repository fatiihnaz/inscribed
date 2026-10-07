import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { discoverManifests } from "../../server/discover.js";

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");

/**
 * Warnings carry absolute file paths (and OS-specific separators). Rebase them
 * onto the fixtures root with forward slashes so snapshots are stable across
 * machines and platforms.
 *
 * @param {Awaited<ReturnType<typeof discoverManifests>>["warnings"]} warnings
 * @param {string} appRoot
 */
function normalizeWarnings(warnings, appRoot) {
  return warnings.map((w) => ({
    ...w,
    file: path.relative(appRoot, w.file).split(path.sep).join("/"),
  }));
}

/**
 * A single-page fixture's blocks, keyed by blockPath.
 *
 * @param {Awaited<ReturnType<typeof discoverManifests>>["manifests"]} manifests
 */
function byPath(manifests) {
  return Object.fromEntries(manifests[0].blocks.map((block) => [block.blockPath, block]));
}

describe("discoverManifests", () => {
  it("discovers blocks, scopes, groups and DFS order across an app tree", async () => {
    const appRoot = path.join(fixturesRoot, "discover-app");
    const { manifests, warnings } = await discoverManifests({ appRoot });

    expect(manifests).toMatchSnapshot("manifests");
    expect(normalizeWarnings(warnings, appRoot)).toMatchSnapshot("warnings");
  });

  it("emits warnings for non-static / malformed declarations", async () => {
    const appRoot = path.join(fixturesRoot, "discover-warnings");
    const { manifests, warnings } = await discoverManifests({ appRoot });

    expect(manifests).toMatchSnapshot("manifests");
    expect(normalizeWarnings(warnings, appRoot)).toMatchSnapshot("warnings");
  });

  it("respects a custom globalSlug for scope=\"global\" regions", async () => {
    const appRoot = path.join(fixturesRoot, "discover-app");
    const { manifests } = await discoverManifests({ appRoot, globalSlug: "__shared" });

    const slugs = manifests.map((m) => m.slug);
    expect(slugs).toContain("__shared");
    expect(slugs).not.toContain("__global");
  });

  it("returns nothing for an empty / missing app root", async () => {
    const { manifests, warnings } = await discoverManifests({
      appRoot: path.join(fixturesRoot, "does-not-exist"),
    });
    expect(manifests).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("follows relative imports that resolve outside the app root", async () => {
    const appRoot = path.join(fixturesRoot, "discover-project", "app");
    const { manifests, warnings } = await discoverManifests({ appRoot });

    const home = manifests.find((m) => m.slug === "/");
    expect(home).toBeDefined();
    expect(home.blocks.map((b) => b.blockPath)).toEqual(["home.title", "hero.sub"]);
    expect(warnings).toEqual([]);
  });

  it("resolves jsconfig paths aliases and warns on unresolvable ones", async () => {
    const appRoot = path.join(fixturesRoot, "discover-alias", "app");
    const { manifests, warnings } = await discoverManifests({ appRoot });

    const page = manifests.find((m) => m.slug === "/");
    expect(page).toBeDefined();
    expect(page.blocks.map((b) => b.blockPath)).toEqual(["alias.hero"]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('"@/components/DoesNotExist"');
    expect(warnings[0].message).toContain("path alias");
  });

  it("carries a CmsGroup prefix into imported components, once per render site", async () => {
    const appRoot = path.join(fixturesRoot, "discover-group-cross");
    const { manifests, warnings } = await discoverManifests({ appRoot });

    // <Hero> is rendered under two groups and once bare, so its single region
    // yields all three paths - matching what the runtime reads at each site.
    const page = manifests.find((m) => m.slug === "/");
    expect(page.blocks.map((b) => b.blockPath)).toEqual([
      "hero.title", "footer.title", "title",
    ]);
    expect(warnings).toEqual([]);
  });

  it("warns when a CmsGroup wraps {children} instead of a static render site", async () => {
    const appRoot = path.join(fixturesRoot, "discover-group-children");
    const { manifests, warnings } = await discoverManifests({ appRoot });

    // No static edge to follow: the region syncs unprefixed while the runtime
    // reads it as "sec.note".
    const page = manifests.find((m) => m.slug === "/");
    expect(page.blocks.map((b) => b.blockPath)).toEqual(["note"]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("{children}");
    expect(warnings[0].message).toContain('name="sec"');
  });

  it("derives slugs from page file paths, dropping route groups", async () => {
    const appRoot = path.join(fixturesRoot, "discover-routes");
    const { manifests, warnings, roots } = await discoverManifests({
      appRoot,
      locales: ["tr", "en"],
    });

    expect(manifests.map((m) => m.slug)).toEqual([
      "/", "/about", "/news/[id]", "/pricing",
    ]);
    expect(path.relative(appRoot, roots.get("/pricing")).split(path.sep).join("/")).toBe(
      "(marketing)/pricing/page.jsx",
    );

    // Only /news/[id] is dynamic and declares blocks; the rest are quiet.
    expect(warnings.map((w) => w.message)).toEqual([
      expect.stringContaining('Derived slug "/news/[id]" contains a dynamic segment'),
    ]);
  });

  it("warns that a dynamic-segment page shares one set of rows, and still syncs it", async () => {
    const appRoot = path.join(fixturesRoot, "discover-routes");
    const { manifests, warnings } = await discoverManifests({
      appRoot,
      locales: ["tr", "en"],
    });

    // Surfaced, not blocked: shared rows are correct for a page whose copy
    // doesn't vary, and nothing at author time tells the two apart.
    expect(manifests.map((m) => m.slug)).toContain("/news/[id]");

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("editing /news/one also rewrites /news/another");
    expect(warnings[0].message).toContain("<CollectionItem>");
    expect(warnings[0].file.endsWith("page.jsx")).toBe(true);
  });

  it("stays silent for a dynamic-segment page that declares no regions", async () => {
    const appRoot = path.join(fixturesRoot, "discover-routes");
    const { manifests, warnings } = await discoverManifests({ appRoot });

    // app/etkinlik/[id]/page.jsx: dynamic, but owns no rows, so it can't
    // surprise anyone and never reaches the manifest.
    expect(manifests.map((m) => m.slug)).not.toContain("/etkinlik/[id]");
    expect(warnings.every((w) => !w.message.includes("/etkinlik/[id]"))).toBe(true);
  });

  it("keeps the leading dynamic segment when no locales are configured", async () => {
    const appRoot = path.join(fixturesRoot, "discover-routes");
    const { manifests } = await discoverManifests({ appRoot });

    expect(manifests.map((m) => m.slug)).toContain("/[locale]/news/[id]");
    expect(manifests.map((m) => m.slug)).not.toContain("/news/[id]");
  });

  it("skips pages that are not routable on their own", async () => {
    const appRoot = path.join(fixturesRoot, "discover-routes");
    const { manifests } = await discoverManifests({ appRoot });

    // _private (never routed), @modal (a layout slot) and (.)photo (an
    // interception of a path another page owns) declare regions that must
    // reach no manifest at all.
    const paths = manifests.flatMap((m) => m.blocks.map((b) => b.blockPath));
    expect(paths).not.toContain("private.title");
    expect(paths).not.toContain("modal.title");
    expect(paths).not.toContain("photo.title");
  });

  it("leaves a page that declares no regions out of the manifest", async () => {
    const appRoot = path.join(fixturesRoot, "discover-routes");
    const { manifests } = await discoverManifests({ appRoot });

    expect(manifests.map((m) => m.slug)).not.toContain("/contact");
  });

  it("warns when two page files derive the same slug", async () => {
    const appRoot = path.join(fixturesRoot, "discover-dup-slug");
    const { manifests, warnings } = await discoverManifests({ appRoot });

    expect(manifests).toHaveLength(1);
    expect(manifests[0].slug).toBe("/dup");
    expect(manifests[0].blocks.map((b) => b.blockPath)).toEqual(["dup.a", "dup.b"]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('the slug "/dup"');
  });

  it("skips unparseable files with a warning instead of throwing", async () => {
    const appRoot = path.join(fixturesRoot, "discover-parse-error");
    const { manifests, warnings } = await discoverManifests({ appRoot });

    const page = manifests.find((m) => m.slug === "/");
    expect(page).toBeDefined();
    expect(page.blocks.map((b) => b.blockPath)).toEqual(["ok.title"]);

    const parseWarnings = warnings.filter((w) => w.message.startsWith("Failed to parse"));
    expect(parseWarnings).toHaveLength(1);
    expect(parseWarnings[0].file.endsWith("broken.jsx")).toBe(true);
  });

  it("splits a per-language defaultValue into one seed per language", async () => {
    const appRoot = path.join(fixturesRoot, "discover-locale-defaults");
    const { manifests } = await discoverManifests({ appRoot, locales: ["tr", "en"] });
    const blocks = byPath(manifests);

    // The default locale's value stays on `defaultValue`, so a backend reading
    // only that field seeds every language the way it did before the map.
    expect(blocks["hero.title"]).toMatchObject({
      defaultValue: "Merhaba",
      defaultValues: { tr: "Merhaba", en: "Hello" },
    });
    expect(blocks["hero.poster"].defaultValues).toEqual({
      tr: { src: "/tr.png", alt: "Afis" },
      en: { src: "/en.png", alt: "Poster" },
    });
    expect(blocks["hero.state"].defaultValues).toEqual({ tr: "taslak", en: "draft" });
    expect(blocks["hero.cards"].defaultValues).toEqual({
      tr: [{ title: "Kart" }],
      en: [{ title: "Card" }],
    });

    // An Image's own keys are not languages, so its shape syncs as the value.
    expect(blocks["hero.image"]).toMatchObject({ defaultValue: { src: "/hero.png", alt: "" } });
    expect(blocks["hero.image"].defaultValues).toBeUndefined();
  });

  it("warns about the languages a per-language defaultValue leaves out", async () => {
    const appRoot = path.join(fixturesRoot, "discover-locale-defaults");
    const { manifests, warnings } = await discoverManifests({ appRoot, locales: ["tr", "en"] });
    const blocks = byPath(manifests);

    expect(blocks["hero.body"]).toMatchObject({
      defaultValue: "Uzun metin",
      defaultValues: { tr: "Uzun metin" },
    });
    // Nothing to fall back on: this map skips the default locale as well.
    expect(blocks["hero.note"]).toMatchObject({ defaultValue: "", defaultValues: { en: "Note" } });

    const skipped = warnings.filter((w) => w.message.includes("the site also has"));
    expect(skipped).toHaveLength(2);
    expect(skipped.find((w) => w.message.includes("hero.body")).message).toContain('the "tr" value');
    expect(skipped.find((w) => w.message.includes("hero.note")).message).toContain("an empty value");
  });

  it("warns rather than guessing when a seed map key is not a language", async () => {
    const appRoot = path.join(fixturesRoot, "discover-locale-defaults");
    const { manifests, warnings } = await discoverManifests({ appRoot, locales: ["tr", "en"] });

    const kicker = byPath(manifests)["hero.kicker"];
    expect(kicker.defaultValues).toBeUndefined();
    expect(kicker.defaultValue).toEqual({ tr: "Ust baslik", eng: "Kicker" });

    const warning = warnings.find((w) => w.message.includes("hero.kicker"));
    expect(warning.message).toContain('"eng"');
  });

  it("reads no seed map at all when the site declares no locales", async () => {
    const appRoot = path.join(fixturesRoot, "discover-locale-defaults");
    const { manifests, warnings } = await discoverManifests({ appRoot });
    const blocks = byPath(manifests);

    expect(Object.values(blocks).every((b) => b.defaultValues === undefined)).toBe(true);
    expect(blocks["hero.title"].defaultValue).toEqual({ tr: "Merhaba", en: "Hello" });
    // A list can't even sync: without the language list its map is not an array.
    expect(blocks["hero.cards"]).toBeUndefined();
    expect(warnings.some((w) => w.message.includes("export `locales` from cms.config.js"))).toBe(true);
  });
});

describe("page metadata", () => {
  const appRoot = path.join(fixturesRoot, "discover-seo");

  it("gives a page the seo blocks its CmsPage.metadata call declares, after its regions", async () => {
    const { manifests } = await discoverManifests({ appRoot, locales: ["tr", "en"] });
    const about = manifests.find((m) => m.slug === "/hakkinda");

    expect(about.blocks.map((b) => [b.blockPath, b.blockType])).toEqual([
      ["body", "LongText"],
      ["seo.title", "ShortText"],
      ["seo.description", "LongText"],
      ["seo.image", "Image"],
      ["seo.noindex", "Bool"],
    ]);
    const seo = Object.fromEntries(about.blocks.map((b) => [b.blockPath, b]));
    expect(seo["seo.title"].defaultValue).toBe("Hakkında");
    expect(seo["seo.title"].defaultValues).toEqual({ tr: "Hakkında", en: "About" });
    expect(seo["seo.description"].defaultValue).toBe("");
    expect(seo["seo.image"].defaultValue).toEqual({ src: "/og.png", alt: "Bina" });
    expect(seo["seo.noindex"].defaultValue).toBe(true);
  });

  it("gives a page with no regions rows of its own through the call alone", async () => {
    const { manifests } = await discoverManifests({ appRoot, locales: ["tr", "en"] });
    const contact = manifests.find((m) => m.slug === "/iletisim");
    expect(contact.blocks.map((b) => b.blockPath)).toEqual(["seo.title", "seo.description", "seo.image", "seo.noindex"]);
    expect(contact.blocks[2].defaultValue).toEqual({ src: "", alt: "" });
  });

  it("refuses a slug that is not the page's own", async () => {
    const { manifests, errors, warnings } = await discoverManifests({ appRoot, locales: ["tr", "en"] });

    expect(manifests.find((m) => m.slug === "/yanlis")).toBeUndefined();
    expect(manifests.find((m) => m.slug === "/baska")).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('CmsPage.metadata("/baska")');
    expect(errors[0].message).toContain('Write "/yanlis"');
    expect(warnings.some((w) => w.message.includes('not "titel"'))).toBe(true);
  });

  it("leaves a collection detail route's metadata call alone", async () => {
    const { manifests } = await discoverManifests({ appRoot, locales: ["tr", "en"] });
    expect(manifests.find((m) => m.slug === "/news/[slug]")).toBeUndefined();
  });
});

describe("page metadata, other ways of writing it", () => {
  const appRoot = path.join(fixturesRoot, "discover-seo");

  it("finds the call inside a generateMetadata of the page's own, and behind satisfies", async () => {
    const { manifests } = await discoverManifests({ appRoot, locales: ["tr", "en"] });
    const wrapped = manifests.find((m) => m.slug === "/sarili");
    expect(wrapped.blocks.map((b) => b.blockPath)).toEqual(["seo.title", "seo.description", "seo.image", "seo.noindex"]);
    expect(wrapped.blocks[0].defaultValue).toBe("Sarılı");
    expect(manifests.find((m) => m.slug === "/ts")).toBeDefined();
  });

  it("says so when the slug is not a literal", async () => {
    const { manifests, warnings } = await discoverManifests({ appRoot, locales: ["tr", "en"] });
    expect(manifests.find((m) => m.slug === "/degisken")).toBeUndefined();
    expect(warnings.some((w) => w.message.includes("takes the page's slug as a string literal"))).toBe(true);
  });
});

describe("page metadata, what counts as the call", () => {
  const appRoot = path.join(fixturesRoot, "discover-seo");

  it("reads a template literal slug, and only the CmsPage call", async () => {
    const { manifests, errors } = await discoverManifests({ appRoot, locales: ["tr", "en"] });
    expect(manifests.find((m) => m.slug === "/sablon")).toBeDefined();
    expect(manifests.find((m) => m.slug === "/yabanci")).toBeDefined();
    expect(errors.some((e) => e.message.includes("/share.png"))).toBe(false);
  });

  it("asks for a literal only in a page file", async () => {
    const { warnings } = await discoverManifests({ appRoot, locales: ["tr", "en"] });
    const literal = warnings.filter((w) => w.message.includes("takes the page's slug as a string literal"));
    expect(literal.map((w) => path.basename(path.dirname(w.file)))).toEqual(["degisken"]);
  });
});
