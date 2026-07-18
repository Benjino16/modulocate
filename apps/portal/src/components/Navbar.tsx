import { Link } from "@tanstack/react-router";

export function Navbar({ tabs }: { tabs: { to: string; label: string }[] }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-b px-6">
      {tabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          activeOptions={{ exact: true }}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          activeProps={{ className: "bg-secondary text-foreground" }}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
