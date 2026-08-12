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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
