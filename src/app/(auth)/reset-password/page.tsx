import { Suspense } from "react";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-[19px] font-semibold tracking-[-0.01em]">Choose a new password</h1>
      <p className="mt-1 mb-6 text-[13.5px] text-muted">After you save it, every device signed in to your account is signed out.</p>
      <Suspense>
        <ResetForm />
      </Suspense>
    </>
  );
}
