import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

/**
 * One face, doing every job. Roboto is the canonical Material typeface, and
 * Material 3 draws its whole type scale from a single family: weight and size
 * separate a display heading from a caption, never a second family.
 *
 * That replaces the three face stack this file used to carry (Orbitron for
 * display, JetBrains Mono for body and numbers, Share Tech Mono for labels).
 * The theme is no longer a terminal, so a monospace ground is wrong, and
 * tabular figures are handled by `font-variant-numeric` on the `.readout`
 * recipe rather than by making the whole product monospace.
 *
 * Loaded through next/font so it is self hosted and inlined at build time: a
 * strict CSP blocks a stylesheet fetched from fonts.googleapis.com, and self
 * hosting also removes a render blocking request.
 *
 * Roboto is a variable font, so weights are not enumerated here: the `.display`
 * and `.placard` recipes in globals.css pick the weight they need.
 */
const body = Roboto({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: brand.name,
  description: brand.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${body.variable}`}>
      {/* suppressHydrationWarning is scoped to this element and covers exactly
          one case: browser extensions such as Grammarly and password managers
          inject attributes into body before React hydrates, which React then
          reports as a mismatch. It suppresses attribute noise on body only, so
          a genuine hydration bug inside the tree still surfaces. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
