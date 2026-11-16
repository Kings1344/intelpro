"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { WalletButton } from "@/components/wallet/wallet-button";
import { api } from "@/lib/client/api";
import { shortAddress } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/auth/rbac";

export function ProfileForm({ name }: { name: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [value, setValue] = useState(name);
  const [loading, setLoading] = useState(false);
  return (
    <form className="flex gap-2" onSubmit={async (e) => {
      e.preventDefault();
      setLoading(true);
      try { await api("/api/users/me", { method: "PATCH", body: { name: value } }); push({ tone: "success", title: "Profile saved" }); router.refresh(); }
      catch (err) { push({ tone: "error", title: "Profile not saved", body: err instanceof Error ? err.message : undefined }); }
      finally { setLoading(false); }
    }}>
      <Input aria-label="Display name" value={value} onChange={(e) => setValue(e.target.value)} minLength={2} maxLength={80} />
      <Button type="submit" loading={loading}>Save profile</Button>
    </form>
  );
}

export function WalletLinker({ linked }: { linked: string[] }) {
  const router = useRouter();
  const { push } = useToast();
  const { publicKey, signMessage } = useWallet();
  const [loading, setLoading] = useState(false);
  const address = publicKey?.toBase58();

  if (!address) return <div className="flex flex-wrap items-center gap-3"><WalletButton /><span className="text-[13px] text-muted">Connect a wallet to link it.</span></div>;
  if (linked.includes(address)) return <Notice tone="emerald">The connected wallet {shortAddress(address)} is linked to your account.</Notice>;
  if (!signMessage) return <Notice tone="amber">This wallet does not support message signing, so it cannot be linked.</Notice>;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" loading={loading} onClick={async () => {
        setLoading(true);
        try {
          const { nonce, message } = await api<{ nonce: string; message: string }>("/api/wallet/nonce", { body: { address } });
          const sig = await signMessage(new TextEncoder().encode(message));
          let bin = "";
          sig.forEach((b) => (bin += String.fromCharCode(b)));
          await api("/api/wallet/verify", { body: { address, nonce, signature: btoa(bin) } });
          push({ tone: "success", title: "Wallet linked", body: shortAddress(address) });
          router.refresh();
        } catch (e) {
          push({ tone: "error", title: "Wallet not linked", body: e instanceof Error ? e.message : undefined });
        } finally {
          setLoading(false);
        }
      }}>Link {shortAddress(address)}</Button>
      <span className="text-[12.5px] text-faint">Your wallet will ask you to sign a message.</span>
    </div>
  );
}

export function UnlinkWallet({ address }: { address: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button size="sm" variant="ghost" loading={loading} onClick={async () => {
      if (!window.confirm(`Unlink ${shortAddress(address)}? Its recorded transactions stay in your history.`)) return;
      setLoading(true);
      try { await api(`/api/wallet/${address}`, { method: "DELETE" }); push({ tone: "success", title: "Wallet unlinked" }); router.refresh(); }
      catch (e) { push({ tone: "error", title: "Wallet not unlinked", body: e instanceof Error ? e.message : undefined }); setLoading(false); }
    }}>Unlink</Button>
  );
}

export function RoleSelect({ userId, role, disabled }: { userId: string; role: Role; disabled?: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [value, setValue] = useState(role);
  return (
    <Select aria-label="Role" className="w-44" value={value} disabled={disabled} onChange={async (e) => {
      const next = e.target.value as Role;
      setValue(next);
      try { await api(`/api/admin/users/${userId}/role`, { method: "PATCH", body: { role: next } }); push({ tone: "success", title: `Role changed to ${ROLE_LABELS[next].toLowerCase()}` }); router.refresh(); }
      catch (err) { setValue(role); push({ tone: "error", title: "Role not changed", body: err instanceof Error ? err.message : undefined }); }
    }}>
      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
    </Select>
  );
}
