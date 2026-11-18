import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <Link href="/" className="mb-8" aria-label="Lockline home">
        <Logo />
      </Link>
      <div className="w-full max-w-[400px] rounded-[var(--radius-container)] border border-line bg-surface p-6 sm:p-7">{children}</div>
      <p className="mt-6 max-w-[400px] text-center text-[12px] leading-relaxed text-faint">
        Lockline never asks for seed phrases or private keys. Wallets are linked by signing a free message.
      </p>
    </div>
  );
}
