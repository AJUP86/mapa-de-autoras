// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

// `loadEnv` merges .env files with process.env — covers local builds,
// Cloudflare Pages, and CI placeholders alike.
const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "PUBLIC_");
const isBuild = process.argv.includes("build");
const isDev = process.argv.includes("dev");

// Fail `astro build` loudly when the public runtime config is missing.
// Without this, a misconfigured Pages build succeeds and ships a site whose
// Supabase client silently points at 127.0.0.1 (see staging runbook).
// Runs only on `build` (not `dev`/`check`), so type-checks and the dev server
// are unaffected.
if (isBuild) {
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

// Stage 11: PUBLIC_MAP_OPEN picks the release phase (open map vs. "Abre
// pronto"), so a typo must not silently close — or open — the map. Checked on
// `build` and on `dev` (the dev server refuses to start without it), not on
// `check`.
if (isBuild || isDev) {
  const value = env.PUBLIC_MAP_OPEN;
  if (value !== "true" && value !== "false") {
    throw new Error(
      `[build] PUBLIC_MAP_OPEN must be "true" or "false" (got "${value ?? ""}"). Set it in .env (local) or the Pages project (hosted).`,
    );
  }
}

// Same rule as parseMapOpen() in src/lib/site-config.ts (MAP_OPEN): only the
// exact string "true" opens the map. Not imported from there: that module
// reads import.meta.env on load, which Astro only fills in after the config.
const mapOpen = env.PUBLIC_MAP_OPEN === "true";

// Kept out of the sitemap: /[lang]/book is a single client-rendered route —
// without ?id= it is a soft 404; /[lang]/books only redirects to the map's
// list view (noindex). While the map is closed, /map, /suggest and /thanks are
// the "Abre pronto" page (noindex) too.
const unlisted = mapOpen ? /\/(es|en)\/books?\/?$/ : /\/(es|en)\/(map|books?|suggest|thanks)\/?$/;

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
      filter: (page) => !page.includes("/admin") && !unlisted.test(page),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    // Dev only. While the map is closed, its code is reached only through the
    // admin gate's lazy import("./MapApp") (AdminMap.tsx), so the dev server
    // would discover these packages at that moment, re-bundle them and answer
    // the import with "504 Outdated Optimize Dep" — the admin then sees
    // "Abre pronto" instead of the map. Pre-bundling them at startup avoids it
    // (the Supabase client too: every island's session check needs it).
    optimizeDeps: {
      include: [
        "d3-geo",
        "d3-selection",
        "d3-transition",
        "d3-zoom",
        "topojson-client",
        "@supabase/supabase-js",
      ],
    },
  },
});
