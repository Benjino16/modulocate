import type { ReactNode } from "react";
import { Navbar } from "./Navbar";

export function PhaseLayout({
  tabs,
  children,
}: {
  tabs: { to: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <>
      <Navbar tabs={tabs} />
      <div className="flex-1 overflow-auto p-6">{children}</div>
    </>
  );
}
