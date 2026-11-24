import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthErrorView } from "./view";

export const metadata: Metadata = { title: "Sign-in problem" };

export default function Page() {
  return (
    <Suspense>
      <AuthErrorView />
    </Suspense>
  );
}
