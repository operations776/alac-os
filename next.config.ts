import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deliberately not setting turbopack.root. This repo sits inside a larger
  // workspace that has its own lockfile, so Next warns that it inferred the
  // root. Pinning the root to this directory breaks the React client manifest:
  // dependencies resolve through the parent, and the bundler then cannot find
  // next/dist/client/components/builtin/global-error.js. The warning is
  // cosmetic and only appears in local dev, where the parent workspace exists.
  // On Vercel this repo is the whole checkout, so no warning is emitted.

  /**
   * The portfolio model's routes, pointed at what replaced them.
   *
   * These are permanent because the old screens are not coming back: the
   * portfolio, dashboard and tier review were removed when the desk command
   * center replaced that model. Anyone holding a bookmark or an open tab from
   * before hits a 404 otherwise, which is how this was found.
   *
   * /accounts/:id cannot be forwarded to its new page. The old route keyed on
   * an accounts row id and that table is gone, so there is no id to translate.
   * It lands on the queue, where the company can be searched by name.
   */
  redirects() {
    return [
      { source: "/dashboard", destination: "/command", permanent: true },
      { source: "/portfolio", destination: "/command", permanent: true },
      { source: "/portfolio/review", destination: "/queue?prep=READY+FOR+QC", permanent: true },
      { source: "/accounts", destination: "/queue", permanent: true },
      { source: "/accounts/:id", destination: "/queue", permanent: true },
    ];
  },
};

export default nextConfig;
