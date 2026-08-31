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
    // Lifts Testing Library's one-second async budget for the files that mount
    // the whole drawer: under a full parallel run those waits are legitimately
    // longer than a second. See the file for why.
    setupFiles: ["./src/tests/setup.js"],
    // Comfortably above that budget, so a wait that is merely slow fails on its
    // own assertion ("the row never rendered") rather than on the suite's clock,
    // which says nothing about what went wrong.
    testTimeout: 15000,
  },
});
