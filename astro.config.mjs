// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

// Fail `astro build` loudly when the public runtime config is missing.
// Without this, a misconfigured Pages build succeeds and ships a site whose
// Supabase client silently points at 127.0.0.1 (see staging runbook).
// `loadEnv` merges .env files with process.env — covers local builds,
// Cloudflare Pages, and CI placeholders alike. Guard runs only on `build`
// (not `dev`/`check`), so type-checks and the dev server are unaffected.
if (process.argv.includes("build")) {
  const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "PUBLIC_");
  for (const name of [
    "PUBLIC_SUPABASE_URL",
    "PUBLIC_SUPABASE_ANON_KEY",
    "PUBLIC_TURNSTILE_SITE_KEY",
  ]) {
    if (!env[name]) {
      throw new Error(
        `[build] Missing required env var ${name}. Set it in .env (local) or the Pages project (hosted) — refusing to build a site that cannot reach Supabase.`,
      );
    }
  }
}

export default defineConfig({
  site: "https://mapadeautoras.com",
  output: "static",
  redirects: {
    "/": "/es/",
  },
  i18n: {
    locales: ["es", "en"],
    defaultLocale: "es",
    routing: {
      prefixDefaultLocale: true,
    },
  },
  integrations: [
    react(),
    sitemap({
      // /[lang]/book is a single client-rendered route; without ?id= it is a
      // soft 404, so keep the bare path out of the sitemap.
      filter: (page) => !page.includes("/admin") && !/\/(es|en)\/book\/?$/.test(page),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
