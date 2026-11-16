import { Suspense } from "react";
import { VerifyEmail } from "./verify";

export const metadata = { title: "Confirm email" };

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
