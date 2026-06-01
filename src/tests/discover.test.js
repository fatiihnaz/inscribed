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
});
