import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo />
      <h1 className="text-[20px] font-semibold">Nothing at this address</h1>
      <p className="max-w-md text-[14px] text-muted">The market, evidence record or page you followed doesn&apos;t exist, or it was removed.</p>
      <Link href="/overview" className="text-[13.5px] text-emerald hover:underline">Go to the overview</Link>
    </div>
  );
}
