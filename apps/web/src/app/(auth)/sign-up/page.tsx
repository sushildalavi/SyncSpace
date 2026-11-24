import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
