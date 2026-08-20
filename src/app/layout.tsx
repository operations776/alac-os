import type { Metadata } from "next";
import { Barlow, DM_Sans } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

/**
 * The two faces the marketing site uses, for the same two jobs.
 *
 * Barlow announces: page titles, panel headings, anything that states
 * something. DM Sans is read: body copy, table cells, every number.
 *
 * The third face, the tracked uppercase mono the brand puts under its hero
 * and across its nav, is not loaded. The site declares it as
 * `Courier New, monospace`, so it is a system stack and costs no request.
 *
 * Loaded through next/font so both are self hosted and inlined at build time:
 * a strict CSP blocks a stylesheet fetched from fonts.googleapis.com, and self
 * hosting also removes a render blocking request.
 */
const display = Barlow({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  // Barlow ships static weights rather than a variable axis, so the ones the
  // theme actually uses have to be named. Adding a weight here means adding a
  // font file to the bundle, so this list stays short on purpose.
  weight: ["500", "600", "700"],
});

const body = DM_Sans({
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
    <html lang="en" className={`h-full ${display.variable} ${body.variable}`}>
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
