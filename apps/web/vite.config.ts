import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { defineConfig } from "vitest/config";

const apiPrefix = process.env.VITE_API_PREFIX ?? "api";
const apiBasePath = `/${apiPrefix}`;
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:4000";
const isVitest = process.env.VITEST === "true";

export default defineConfig({
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      generatedRouteTree: "./src/routeTree.gen.ts",
      routeFileIgnorePattern: "\\.test\\.[cm]?[jt]sx?$",
      routeFileIgnorePrefix: "-",
      routesDirectory: "./src/routes",
    }),
    react(),
    tailwindcss(),
    ...(isVitest ? [] : [codeInspectorPlugin({ bundler: "vite" })]),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      [apiBasePath]: {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    fileParallelism: false,
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
