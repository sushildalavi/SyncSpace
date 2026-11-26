import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmail } from "./verifyEmail";

export const metadata: Metadata = { title: "Confirm your email" };

export default function Page() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
