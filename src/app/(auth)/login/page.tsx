import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-[19px] font-semibold tracking-[-0.01em]">Sign in</h1>
      <p className="mt-1 mb-6 text-[13.5px] text-muted">Continue to your markets, evidence and reviews.</p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </>
  );
}
