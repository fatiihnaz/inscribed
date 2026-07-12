import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure logic + transport contract tests run in plain Node. Component
    // tests opt into jsdom per-file via a `@vitest-environment jsdom`
    // docblock. Scoped to `src/` so the example apps and node_modules never
    // get collected.
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
    // The example apps symlink `inscribed` back to this repo root
    // (example-*/node_modules/inscribed -> .), so an unscoped scan re-collects
    // every test through that cycle and the duplicates load outside the
    // worker ("failed to find the runner"). Exclude the example dirs.
    exclude: ["**/node_modules/**", "**/example-*/**"],
  },
});
