"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Ask your manager" },
  { href: "/plan", label: "Content plan" },
  { href: "/reports", label: "Weekly reports" },
  { href: "/media-kit", label: "Media kit" },
  { href: "/connections", label: "Connected accounts" },
  { href: "/profile", label: "Your profile" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {LINKS.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
