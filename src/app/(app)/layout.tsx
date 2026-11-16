import { getCurrentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { WalletProviders } from "@/components/wallet/providers";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <WalletProviders>
      <AppShell user={user ? { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified } : null}>{children}</AppShell>
    </WalletProviders>
  );
}
