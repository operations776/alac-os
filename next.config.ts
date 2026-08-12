import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deliberately not setting turbopack.root. This repo sits inside a larger
  // workspace that has its own lockfile, so Next warns that it inferred the
  // root. Pinning the root to this directory breaks the React client manifest:
  // dependencies resolve through the parent, and the bundler then cannot find
  // next/dist/client/components/builtin/global-error.js. The warning is
  // cosmetic and only appears in local dev, where the parent workspace exists.
  // On Vercel this repo is the whole checkout, so no warning is emitted.
};

export default nextConfig;
