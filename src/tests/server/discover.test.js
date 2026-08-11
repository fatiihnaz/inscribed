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
});
