import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-[19px] font-semibold tracking-[-0.01em]">Create your account</h1>
      <p className="mt-1 mb-6 text-[13.5px] text-muted">New accounts can create markets and submit evidence once their email is confirmed. An administrator can grant reviewer access.</p>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </>
  );
}
