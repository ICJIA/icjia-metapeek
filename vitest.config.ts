import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
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
