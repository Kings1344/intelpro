"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass, PenTool, Scale, Settings, Menu, X, Bell, LogOut, LogIn,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { WalletButton } from "@/components/wallet/wallet-button";
import { Badge } from "@/components/ui/badge";
import { publicConfig } from "@/lib/config";
import { api } from "@/lib/client/api";
import { cn, relativeTime } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/auth/rbac";

// One flow: write rules, lock and launch them as a PREDICT market, trade, resolve.
// The other modules (overview, evidence vault, integrity, disputes, portfolio) still
// exist and are reached from a market's own page.
const NAV = [
  { href: "/architect", label: "Write rules", icon: PenTool },
  { href: "/markets", label: "Markets", icon: Compass },
  { href: "/resolution", label: "Resolve", icon: Scale },
  { href: "/settings", label: "Settings", icon: Settings },
];

type User = { id: string; name: string; email: string; role: Role; emailVerified: boolean } | null;

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-ground transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between px-5">
          <Link href="/markets" aria-label="Lockline markets">
            <Logo />
          </Link>
          <button className="text-muted lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3 scrollbar-thin" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-control)] px-2.5 py-2 text-[13.5px] transition-colors",
                  active ? "bg-raised text-fg" : "text-muted hover:bg-surface hover:text-fg",
                )}
              >
                <Icon className={cn("size-[17px]", active ? "text-emerald" : "text-faint")} strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line px-5 py-4 text-[12px] leading-relaxed text-faint">
          Rules are locked on-chain at launch. Resolution is checked against them.
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-ground/90 px-4 backdrop-blur sm:px-6">
          <button className="text-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <Badge tone={publicConfig.solana.network === "devnet" ? "amber" : "emerald"} dot className="hidden sm:inline-flex">
            Solana {publicConfig.solana.network === "devnet" ? "Devnet" : "Mainnet"}
          </Badge>
          <WalletButton />
          {user ? <Notifications /> : null}
          {user ? <UserMenu user={user} /> : (
            <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="inline-flex h-[34px] items-center gap-2 rounded-[var(--radius-control)] bg-emerald px-3 text-[13px] font-medium text-[#06130d] hover:bg-emerald-soft">
              <LogIn className="size-4" /> Sign in
            </Link>
          )}
        </header>
        {user && !user.emailVerified && <VerifyBanner email={user.email} />}
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function VerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="border-b border-amber/30 bg-amber-wash px-4 py-2.5 text-[13px] text-amber sm:px-6" role="status" data-testid="verify-banner">
      Confirm {email} to create markets, submit evidence and take part in disputes.{" "}
      {state === "sent" ? (
        <span className="text-fg">Email sent. Check your inbox.</span>
      ) : (
        <button
          className="font-medium text-fg underline-offset-4 hover:underline disabled:opacity-60"
          disabled={state === "sending"}
          onClick={async () => {
            setState("sending");
            try {
              await api("/api/auth/resend-verification", { method: "POST" });
              setState("sent");
            } catch (e) {
              setState("error");
              setMsg(e instanceof Error ? e.message : "Could not send.");
            }
          }}
        >
          {state === "sending" ? "Sending…" : "Resend email"}
        </button>
      )}
      {state === "error" && msg && <span className="ml-2 text-rust">{msg}</span>}
    </div>
  );
}

function UserMenu({ user }: { user: NonNullable<User> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex size-[34px] items-center justify-center rounded-full border border-line-strong bg-raised text-[12.5px] font-semibold text-fg" aria-label="Account menu" aria-expanded={open}>
        {user.name.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-[var(--radius-control)] border border-line bg-surface p-1.5 text-[13px]" onMouseLeave={() => setOpen(false)}>
          <div className="px-2.5 py-2">
            <p className="font-medium text-fg">{user.name}</p>
            <p className="truncate text-muted">{user.email}</p>
            <p className="mt-1 text-[12px] text-faint">{ROLE_LABELS[user.role]}</p>
          </div>
          <Link href="/settings" className="block rounded px-2.5 py-2 text-muted hover:bg-raised hover:text-fg">Account settings</Link>
          <button
            className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-muted hover:bg-raised hover:text-fg"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

type Notif = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

function Notifications() {
  const [data, setData] = useState<{ items: Notif[]; unread: number } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const load = () => api<{ items: Notif[]; unread: number }>("/api/notifications").then(setData).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative flex size-[34px] items-center justify-center rounded-[var(--radius-control)] text-muted hover:bg-raised hover:text-fg" aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ""}`}>
        <Bell className="size-[17px]" strokeWidth={1.75} />
        {!!data?.unread && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-emerald" />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-[var(--radius-control)] border border-line bg-surface text-[13px]">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <span className="font-medium">Notifications</span>
            {!!data?.unread && (
              <button className="text-[12px] text-emerald hover:underline" onClick={async () => { await api("/api/notifications", { method: "PATCH", body: { all: true } }); setData((d) => d && { items: d.items.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })), unread: 0 }); }}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {!data?.items.length ? (
              <p className="px-3.5 py-6 text-muted">You&apos;re up to date. Alerts about your markets, evidence and disputes appear here.</p>
            ) : (
              data.items.map((n) => (
                <Link key={n.id} href={n.link ?? "#"} onClick={() => setOpen(false)} className={cn("block border-b border-line px-3.5 py-2.5 last:border-0 hover:bg-raised", !n.readAt && "bg-emerald-wash/40")}>
                  <p className="font-medium text-fg">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-muted">{n.body}</p>
                  <p className="mt-1 text-[11.5px] text-faint">{relativeTime(n.createdAt)}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
