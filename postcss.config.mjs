// postcss.config.mjs
// Tailwind CSS 4 PostCSS plugin for Next.js.
// In test environments (vitest), Vite's CSS pipeline can't load this plugin.
// We detect vitest and skip the plugin so tests run cleanly.

const isTest = process.env.NODE_ENV === "test" || !!process.env.VITEST;

const config = {
  plugins: isTest ? [] : ["@tailwindcss/postcss"],
};

export default config;
