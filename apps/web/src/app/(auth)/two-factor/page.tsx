import type { Metadata } from "next";
import { Suspense } from "react";
import { TwoFactorForm } from "./twoFactorForm";

export const metadata: Metadata = { title: "Two-factor sign-in" };

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorForm />
    </Suspense>
  );
}
