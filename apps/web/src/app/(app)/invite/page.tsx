import { Suspense } from "react";
import { InviteView } from "./view";

export default function Page() {
  return (
    <Suspense>
      <InviteView />
    </Suspense>
  );
}
