import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { discoverManifests } from "../server/discover.js";

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

    const page = manifests.find((m) => m.slug === "/aliased");
    expect(page).toBeDefined();
    expect(page.blocks.map((b) => b.blockPath)).toEqual(["alias.hero"]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('"@/components/DoesNotExist"');
    expect(warnings[0].message).toContain("path alias");
  });

  it("warns when a CmsGroup wraps an imported component that declares regions", async () => {
    const appRoot = path.join(fixturesRoot, "discover-group-cross");
    const { manifests, warnings } = await discoverManifests({ appRoot });

    // The manifest registers the unprefixed path; the warning explains the
    // runtime/manifest mismatch. <Plain /> (no regions) must stay silent.
    const page = manifests.find((m) => m.slug === "/cross");
    expect(page.blocks.map((b) => b.blockPath)).toEqual(["title"]);

    const groupWarnings = warnings.filter((w) => w.message.includes("group prefix"));
    expect(groupWarnings).toHaveLength(1);
    expect(groupWarnings[0].message).toContain("<Hero>");
    expect(groupWarnings[0].message).toContain('name="hero"');
  });

  it("skips unparseable files with a warning instead of throwing", async () => {
    const appRoot = path.join(fixturesRoot, "discover-parse-error");
    const { manifests, warnings } = await discoverManifests({ appRoot });

    const page = manifests.find((m) => m.slug === "/ok");
    expect(page).toBeDefined();
    expect(page.blocks.map((b) => b.blockPath)).toEqual(["ok.title"]);

    const parseWarnings = warnings.filter((w) => w.message.startsWith("Failed to parse"));
    expect(parseWarnings).toHaveLength(1);
    expect(parseWarnings[0].file.endsWith("broken.jsx")).toBe(true);
  });
});
