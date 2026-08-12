import type { Metadata } from "next";
import { brand } from "@/config/brand";
import "./globals.css";

// System font stack per DESIGN.md section 3. No webfont: this is an internal
// tool opened daily, and a font request is latency bought for nothing.

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
    <html lang="en" className="h-full">
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
