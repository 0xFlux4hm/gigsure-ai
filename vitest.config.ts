/**
 * Vitest configuration.
 *
 * Test files live in /tests. Path aliases match the tsconfig.json "@/*"
 * convention so tests can import from "@/lib/..." etc.
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Disable CSS processing in tests — we only test backend logic
  css: false,
  // Prevent Vite from loading Next.js's PostCSS / Tailwind configs
  plugins: [
    {
      name: "ignore-postcss",
      configResolved(config) {
        // Vite reads postcss config from a file — empty it out so vitest doesn't try to load @tailwindcss/postcss
        config.css ??= {};
        if (config.css) {
          (config.css as { postcss?: unknown }).postcss = null;
        }
      },
    },
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**", "src/app/api/**"],
      exclude: ["**/*.test.ts", "src/app/api/auth/[...nextauth]/**"],
    },
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
