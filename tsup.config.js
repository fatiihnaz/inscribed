import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.js",
    server: "src/server/get-content.js",
    actions: "src/server/actions.js",
    page: "src/server/cms-page.jsx",
    "auth-server": "src/auth/server/index.js",
    "auth-server-signin": "src/auth/server/signin.js",
    "auth-client": "src/auth/client/index.jsx",
  },
  format: ["esm"],
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "next", "next-auth", "server-only", "client-only"],
});
