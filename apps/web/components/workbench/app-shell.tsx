"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import {
  Archive,
  CalendarClock,
  FileText,
  Gauge,
  History,
  LogOut,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { href: "/app", label: "Dashboard", icon: Gauge },
  { href: "/app/runs", label: "Runs", icon: Archive },
  { href: "/app/drafts", label: "Drafts & approvals", icon: FileText },
  { href: "/app/schedules", label: "Schedules", icon: CalendarClock },
  {
    href: "/app/profiles",
    label: "Profiles & destinations",
    icon: SlidersHorizontal,
  },
  { href: "/app/history", label: "History", icon: History },
  { href: "/settings/provider", label: "Local runner", icon: Settings2 },
] as const;

export function AppShell({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const pathname = usePathname();
  const { signOut } = useAuthActions();

  return (
    <main className="desk-shell">
      <a className="skip-link" href="#desk-content">
        Skip to main content
      </a>
      <aside className="desk-rail">
        <Link className="desk-wordmark" href="/app">
          <span>OSA</span>
          <strong>Open Social Agent</strong>
          <small>operator desk · v0.1</small>
        </Link>
        <nav aria-label="Product navigation">
          {navigation.map(({ href, label, icon: Icon }, index) => {
            const active =
              href === "/app" ? pathname === href : pathname.startsWith(href);
            return (
              <Link className={active ? "active" : ""} href={href} key={href}>
                <small>{String(index + 1).padStart(2, "0")}</small>
                <Icon size={17} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="rail-boundary">
          <span className="boundary-light" />
          <div>
            <strong>Approval enforced</strong>
            <small>Schedules prepare. You publish.</small>
          </div>
        </div>
        <button
          className="rail-signout"
          onClick={() => void signOut()}
          type="button"
        >
          <LogOut size={15} /> Sign out
        </button>
      </aside>
      <section className="desk-main" id="desk-content" tabIndex={-1}>
        <header className="desk-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          {action ? <div className="desk-header-action">{action}</div> : null}
        </header>
        {children}
      </section>
    </main>
  );
}

export function StateStamp({ state }: { state: string }) {
  return (
    <span className={`state-stamp state-${state}`}>
      {state.replaceAll("_", " ")}
    </span>
  );
}

export function EmptyDesk({
  number,
  title,
  copy,
  action,
}: {
  number: string;
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <section className="empty-desk">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{copy}</p>
        {action}
      </div>
    </section>
  );
}

export function formatMoment(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
