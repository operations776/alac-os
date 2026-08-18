import type { Metadata } from "next";
import { JetBrains_Mono, Orbitron, Share_Tech_Mono } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

/**
 * Three faces, three jobs. Loaded through next/font so they are self hosted
 * and inlined at build time: a strict CSP blocks a stylesheet fetched from
 * fonts.googleapis.com, and self hosting also removes the render blocking
 * request this app used to avoid by shipping no webfont at all.
 *
 * Orbitron is the display face: geometric, mechanical, headings only.
 * JetBrains Mono carries body, UI, and every number the engine computed.
 * Share Tech Mono is the placard face, for HUD labels and column heads.
 *
 * Nothing here is proportional. The product is a terminal and a proportional
 * face in it reads as a document that wandered into the wrong window.
 */
const display = Orbitron({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const body = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

// Share Tech Mono ships a single weight, so it has to be named explicitly.
const label = Share_Tech_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-label",
  weight: ["400"],
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
    <html
      lang="en"
      className={`h-full ${display.variable} ${body.variable} ${label.variable}`}
    >
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
