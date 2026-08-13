import type { Metadata } from "next";
import { Archivo, Saira_Condensed, Spline_Sans_Mono } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

/**
 * Three faces, three jobs. Loaded through next/font so they are self hosted
 * and inlined at build time: a strict CSP blocks a stylesheet fetched from
 * fonts.googleapis.com, and self hosting also removes the render blocking
 * request this app used to avoid by shipping no webfont at all.
 *
 * Archivo, the grotesque, carries UI and headings.
 * Saira Condensed is the placard face, used for panel labels and column heads.
 * Spline Sans Mono is the readout: every number the engine computed.
 */
const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
  axes: ["wdth"],
});

const placard = Saira_Condensed({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-placard",
  weight: ["500", "600", "700"],
});

const readout = Spline_Sans_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-readout",
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
      className={`h-full ${archivo.variable} ${placard.variable} ${readout.variable}`}
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
