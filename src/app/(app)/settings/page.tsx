import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { aiConfigured } from "@/lib/server/env";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import { publicConfig } from "@/lib/config";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Mono, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ProfileForm, WalletLinker, UnlinkWallet, RoleSelect } from "./client";
import { formatDateTime, shortAddress } from "@/lib/utils";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");
  const [wallets, users] = await Promise.all([
    db.wallet.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    user.role === "ADMIN" ? db.user.findMany({ where: { isDemo: false }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, createdAt: true } }) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Settings" description="Your profile, linked wallets and access." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Profile" description={`${user.email} (${user.emailVerified ? "confirmed" : "not confirmed yet"}). Role: ${ROLE_LABELS[user.role]}.`} />
          <CardBody><ProfileForm name={user.name} /></CardBody>
        </Card>

        <Card>
          <CardHeader title="Solana wallets" description="Linking proves ownership with a signed message. It is free, sends no transaction, and Lockline never sees your keys or seed phrase." />
          <CardBody className="space-y-4">
            {wallets.length > 0 && (
              <ul className="divide-y divide-line rounded-[var(--radius-control)] border border-line">
                {wallets.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                    <Mono className="text-fg">{shortAddress(w.address, 8)}</Mono>
                    <Badge tone="neutral">{w.network}</Badge>
                    <span className="text-[12px] text-faint">verified {formatDateTime(w.verifiedAt)}</span>
                    <span className="ml-auto"><UnlinkWallet address={w.address} /></span>
                  </li>
                ))}
              </ul>
            )}
            <WalletLinker linked={wallets.map((w) => w.address)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="System status" />
          <CardBody>
            <dl className="space-y-3 text-[13px]">
              <Row k="Intelligence engine" v={aiConfigured() ? <Badge tone="emerald">AI provider configured</Badge> : <Badge tone="outline">Heuristic engine only (no AI key)</Badge>} />
              <Row k="Solana network" v={<Badge tone="amber">{publicConfig.solana.network}</Badge>} />
              <Row k="RPC" v={<Mono>{publicConfig.solana.rpcUrl}</Mono>} />
              <Row k="PREDICT program" v={<Mono>{shortAddress(publicConfig.predict.programId, 8)}</Mono>} />
              <Row k="Collateral mint (mUSDC)" v={<Mono>{shortAddress(publicConfig.predict.usdcMint, 8)}</Mono>} />
            </dl>
          </CardBody>
        </Card>

        {user.role === "ADMIN" && (
          <Card>
            <CardHeader title="Users and roles" description="Administrators can grant market-creator, reviewer and administrator access. Every change is audited." />
            <ul className="divide-y divide-line">
              {users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                  <div className="min-w-0 flex-1"><p className="text-fg">{u.name}</p><p className="truncate text-faint">{u.email}</p></div>
                  <RoleSelect userId={u.id} role={u.role} disabled={u.id === user.id} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>;
}
