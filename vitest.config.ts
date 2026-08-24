import { defineConfig, type Plugin } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  // Two Vite majors are installed: vitest 3.2 brings Vite 7, while Nuxt 4.5
  // (and the hoisted @vitejs/plugin-vue it owns) is built on Vite 8. The
  // plugin is structurally fine in both — tests run green — but TypeScript
  // sees two distinct Plugin identities and rejects the assignment. The cast
  // reconciles the identities only; drop it once vitest and Nuxt agree on a
  // Vite major.
  plugins: [vue() as Plugin],
  resolve: {
    alias: {
      "~": resolve(__dirname, "./app"),
      "@": resolve(__dirname, "./app"),
      "#shared": resolve(__dirname, "./shared"),
    },
  },
  test: {
    environment: "happy-dom",
    include: [
      "tests/unit/**/*.{test,spec}.ts",
      "tests/security/**/*.{test,spec}.ts",
      "tests/integration/**/*.{test,spec}.ts",
    ],
    exclude: ["tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["app/composables/**", "app/utils/**", "server/utils/**", "shared/**"],
      exclude: ["node_modules/", ".nuxt/", "tests/"],
    },
  },
});
