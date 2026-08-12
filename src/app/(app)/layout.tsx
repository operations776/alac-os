import type { ReactNode } from "react";
import { Nav } from "@/components/shell/nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <main className="min-w-0 flex-1 bg-[var(--bg)]">{children}</main>
    </div>
  );
}
